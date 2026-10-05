"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { cloudRequest, uploadAsset } from "./api";
import type { Asset, EventRecord, ShareRecord, UploadSession } from "./types";
import type { useCloud } from "./use-cloud";
import { imagePreview } from "./projects";
import { loadPhoto, releasePhoto } from "../photos/load";
import { QrCode } from "./qr";
import { PhoneReceiver } from "./phone-receiver";
export function CloudPanel({
  cloud,
  ready,
  onExport,
  onPhone,
  event,
  emptySlots,
  onLocalSave,
  onNext,
  projectId,
}: {
  cloud: ReturnType<typeof useCloud>;
  ready: boolean;
  onExport: () => Promise<Blob>;
  onPhone: (assets: Asset[]) => Promise<void>;
  event: EventRecord | null;
  emptySlots: number;
  onLocalSave: () => Promise<void>;
  onNext: () => Promise<void>;
  projectId: string;
}) {
  const [days, setDays] = useState(event?.share_days ?? 7),
    [visibility, setVisibility] = useState(event?.share_visibility ?? "link"),
    [share, setShare] = useState<ShareRecord | null>(null),
    [upload, setUpload] = useState<UploadSession | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function createShare() {
    if (!cloud.owner) {
      await cloud.save();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const project = await cloud.ensureProject(),
        blob = await onExport(),
        asset = await uploadAsset(blob, project.projectId, "export");
      const photo = await loadPhoto(
        new File([blob], "finished-strip", { type: blob.type }),
      );
      let preview;
      try {
        preview = await uploadAsset(
          await imagePreview(photo),
          project.projectId,
          "preview",
        );
      } finally {
        releasePhoto(photo);
      }
      if (event) {
        await cloudRequest(`sessions`, {
          method: "POST",
          body: JSON.stringify({
            eventId: event.id,
            projectId: project.projectId,
          }),
        });
      }
      setShare(
        await cloudRequest<ShareRecord>("shares", {
          method: "POST",
          body: JSON.stringify({
            projectId: project.projectId,
            assetId: asset.id,
            previewAssetId: preview.id,
            eventId: event?.id,
            days,
            visibility,
          }),
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not share. Retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function phone() {
    if (!cloud.owner) {
      await cloud.save();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const project = await cloud.ensureProject();
      setUpload(
        await cloudRequest<UploadSession>("uploads", {
          method: "POST",
          body: JSON.stringify({
            projectId: project.projectId,
            count: emptySlots,
          }),
        }),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not start upload session.",
      );
    } finally {
      setBusy(false);
    }
  }
  const details = useRef<HTMLDetailsElement>(null);
  const autoRef = useRef(createShare),
    autoStarted = useRef("");
  useEffect(() => {
    autoRef.current = createShare;
  });
  useEffect(() => {
    if (
      event?.auto_delivery &&
      event.share_visibility === "link" &&
      ready &&
      cloud.owner &&
      !cloud.busy &&
      cloud.online &&
      autoStarted.current !== projectId
    ) {
      autoStarted.current = projectId;
      if (details.current) details.current.open = true;
      void Promise.resolve().then(() => autoRef.current());
    }
  }, [
    event?.auto_delivery,
    event?.share_visibility,
    ready,
    cloud.owner,
    cloud.busy,
    cloud.online,
    projectId,
  ]);
  const previousProject = useRef(projectId);
  useEffect(() => {
    if (previousProject.current !== projectId) {
      previousProject.current = projectId;
      void Promise.resolve().then(() => {
        setShare(null);
        setUpload(null);
      });
    }
  }, [projectId]);
  return (
    <details ref={details} className="cloud-panel">
      <summary>Save & share {event && `· ${event.name}`}</summary>
      <div className="cloud-actions">
        <button
          className="secondary"
          disabled={cloud.loadingProject || !cloud.localReady}
          onClick={() => void onLocalSave().catch((f) => setError(f.message))}
        >
          Save on Device
        </button>
        <Link href="/local-projects">Local Projects</Link>
        <button
          className="secondary"
          disabled={cloud.busy || !cloud.localReady || !cloud.auth.configured}
          onClick={() => void cloud.save()}
        >
          Save to Cloud
        </button>
        <button
          className="secondary"
          disabled={
            busy ||
            cloud.busy ||
            !cloud.localReady ||
            !cloud.online ||
            !cloud.auth.configured ||
            emptySlots === 0
          }
          onClick={() => void phone()}
        >
          Add Photos from Phone
        </button>
        {cloud.owner ? (
          <>
            <Link href="/account">My Projects</Link>
            <Link href="/events">My Events</Link>
            <button
              className="text-button"
              onClick={() =>
                void cloud.auth.signOut().catch((f) => setError(f.message))
              }
            >
              Sign out
            </button>
            {event && (
              <button
                className="secondary"
                disabled={busy || cloud.busy}
                onClick={() => void onNext().catch((f) => setError(f.message))}
              >
                Next Booth Session
              </button>
            )}
          </>
        ) : (
          <Link href="/sign-in">Sign in</Link>
        )}
      </div>
      {!cloud.auth.configured && (
        <p>
          Cloud features are not configured. Local editing and export work as
          usual.
        </p>
      )}
      <p role="status" aria-label="Cloud sync status">
        {cloud.status}
      </p>
      {cloud.error && <p role="alert">{cloud.error}</p>}
      {cloud.failedProject && (
        <button
          className="secondary"
          onClick={() => void cloud.open(cloud.failedProject)}
        >
          Retry loading originals
        </button>
      )}
      {cloud.conflict && (
        <div className="conflict-actions">
          <p>
            Your local edits are preserved. Resolve the difference before
            syncing.
          </p>
          <button
            className="secondary"
            disabled={cloud.busy}
            onClick={() => void cloud.save(true)}
          >
            Keep Local — Save as Copy
          </button>
          <button
            className="secondary"
            disabled={cloud.busy}
            onClick={() => {
              if (
                confirm(
                  "Load the cloud version? Your local version will be kept in Local Projects for recovery.",
                )
              )
                void cloud.open(cloud.link!.projectId, true);
            }}
          >
            Use Cloud Version
          </button>
        </div>
      )}
      {cloud.pending && !cloud.link && (
        <button className="secondary" onClick={() => void cloud.resume()}>
          Restore pending cloud edits
        </button>
      )}
      <div className="sharing-options">
        <label>
          Share access
          <select
            aria-label="Share access"
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as "private" | "link")
            }
          >
            <option value="link">Anyone with Link</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label>
          Link expiration
          <select
            aria-label="Link expiration"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>24 hours</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={0}>Never</option>
          </select>
        </label>
        <button
          className="primary"
          disabled={
            !ready ||
            busy ||
            cloud.busy ||
            cloud.loadingProject ||
            !cloud.online ||
            !cloud.auth.configured
          }
          onClick={() => void createShare()}
        >
          {busy ? "Preparing..." : "Create Share Link / QR"}
        </button>
      </div>
      <p>
        Sharing uploads a finished strip. Originals stay private. Private links
        cannot be opened by guests.
      </p>
      {error && <p role="alert">{error}</p>}
      {share && (
        <>
          <QrCode url={share.url} />
          {share.visibility === "private" && (
            <p>This link is private; guests cannot download it.</p>
          )}
          <button
            className="text-button"
            onClick={() =>
              void cloudRequest(`shares/${share.id}`, { method: "DELETE" })
                .then(() => setShare(null))
                .catch((f) => setError(f.message))
            }
          >
            Revoke this share
          </button>
        </>
      )}
      {upload && (
        <PhoneReceiver
          session={upload}
          onPhotos={onPhone}
          onClose={() => setUpload(null)}
        />
      )}
    </details>
  );
}
