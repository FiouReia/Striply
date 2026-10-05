"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { validateFile, loadPhoto, releasePhoto } from "../photos/load";
async function publicData<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "This link is unavailable.");
  return value;
}
export function GuestShare({ token }: { token: string }) {
  const [share, setShare] = useState<{
      image: string;
      expires_at: string | null;
      event: { name: string; logo?: string } | null;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void publicData<typeof share>(`/api/public/shares/${token}`)
      .then((value) => {
        if (alive) setShare(value);
      })
      .catch((failure) => {
        if (alive) setError(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  return (
    <main className="guest-page">
      <Link href="/">Striply</Link>
      <h1>{share?.event?.name || "Your little keepsake"}</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : share ? (
        <>
          {share.event?.logo && (
            <img
              className="guest-event-logo"
              src={share.event.logo}
              alt={`${share.event.name} logo`}
            />
          )}
          <img
            className="guest-strip"
            src={share.image}
            alt="Your finished photo strip"
            onError={() =>
              setError(
                "This strip is no longer available. The link may have expired.",
              )
            }
          />
          <a
            className="primary"
            href={`${share.image}${share.image.includes("?") ? "&" : "?"}download=1`}
            download
          >
            Download / Save Image
          </a>
          <p>On a phone, you can also touch and hold the image to save it.</p>
          {share.expires_at && (
            <p>
              Available until {new Date(share.expires_at).toLocaleString()}.
            </p>
          )}
        </>
      ) : (
        <p role="status">Opening your strip...</p>
      )}
    </main>
  );
}
export function GuestGallery({ token }: { token: string }) {
  const [data, setData] = useState<{
      event: { name: string };
      items: { id: string; image: string }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void publicData<typeof data>(`/api/public/galleries/${token}`)
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((failure) => {
        if (alive) setError(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  return (
    <main className="guest-page gallery-page">
      <Link href="/">Striply</Link>
      <h1>{data?.event.name || "Event memories"}</h1>
      {error && <p role="alert">{error}</p>}
      {data && !data.items.length && <p>No shared strips yet.</p>}
      <div className="gallery-grid">
        {data?.items.map((item) => (
          <article key={item.id}>
            <a href={item.image.split("?")[0]} target="_blank" rel="noreferrer">
              <img
                loading="lazy"
                src={item.image}
                alt="Finished event photo strip"
              />
            </a>
            <a
              className="secondary"
              download
              href={`${item.image}${item.image.includes("?") ? "&" : "?"}download=1`}
            >
              Download
            </a>
          </article>
        ))}
      </div>
    </main>
  );
}
export function PhoneUpload({ token }: { token: string }) {
  const [session, setSession] = useState<{
      expires_at: string;
      max_count: number;
      reserved_count: number;
    } | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void publicData<typeof session>(`/api/public/uploads/${token}`)
      .then((value) => {
        if (alive) setSession(value);
      })
      .catch((failure) => {
        if (alive) setError(failure.message);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  async function upload(files: File[]) {
    setBusy(true);
    setError("");
    let sent = 0;
    try {
      for (const file of files) {
        const validation = validateFile(file);
        if (validation) throw new Error(validation);
        const decoded = await loadPhoto(file);
        releasePhoto(decoded);
        const form = new FormData();
        form.set("file", file);
        await publicData(`/api/public/uploads/${token}`, {
          method: "POST",
          body: form,
        });
        sent++;
        setMessage(`${sent} photo${sent === 1 ? "" : "s"} sent to the host.`);
      }
      const next = await publicData<typeof session>(
        `/api/public/uploads/${token}`,
      ).catch(() => null);
      setSession(next);
      if (!next) setMessage(`${sent} photos sent. This session is complete.`);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Upload failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="guest-page">
      <Link href="/">Striply</Link>
      <h1>Send your moments</h1>
      <p>These photos go to the active Striply session on the host device.</p>
      {session && (
        <>
          <p>
            Up to {session.max_count - session.reserved_count} more photos.
            Expires at {new Date(session.expires_at).toLocaleTimeString()}.
          </p>
          <label className="primary upload-label">
            Choose Photos
            <input
              aria-label="Choose phone photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <label className="secondary upload-label">
            Take Photo
            <input
              aria-label="Take phone photo"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}
      {busy && <p role="status">Sending photos...</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
