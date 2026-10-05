"use client";
import { useEffect, useRef, useState } from "react";
import { getBrowserClient } from "../auth/client";
import { cloudRequest } from "./api";
import type { Asset, UploadSession } from "./types";
import { QrCode } from "./qr";
export function PhoneReceiver({
  session,
  onPhotos,
  onClose,
}: {
  session: UploadSession;
  onPhotos: (assets: Asset[]) => Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("Waiting for photos..."),
    [error, setError] = useState("");
  const callback = useRef(onPhotos),
    received = useRef(new Set<string>());
  useEffect(() => {
    callback.current = onPhotos;
  }, [onPhotos]);
  useEffect(() => {
    let alive = true,
      checking = false,
      finished = false;
    async function check() {
      if (
        !alive ||
        checking ||
        finished ||
        !navigator.onLine ||
        document.hidden
      )
        return;
      checking = true;
      try {
        const data = await cloudRequest<{
            session: UploadSession;
            assets: Asset[];
          }>(`uploads/${session.id}`),
          incoming = data.assets.filter(
            (asset) => !received.current.has(asset.id),
          );
        if (incoming.length) {
          await callback.current(incoming);
          incoming.forEach((asset) => received.current.add(asset.id));
        }
        if (!alive) return;
        setError("");
        const ended =
          data.session.status !== "active" ||
          Date.parse(data.session.expires_at) <= Date.now();
        if (ended && data.assets.length >= data.session.reserved_count) {
          finished = true;
          setStatus("Session complete. Received photos are ready to edit.");
        } else
          setStatus(
            `${received.current.size} photos received. Waiting for the next photo...`,
          );
      } catch (failure) {
        if (alive)
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not receive photos. Retrying...",
          );
      } finally {
        checking = false;
      }
    }
    const interval = setInterval(() => void check(), 3000),
      changed = () => void check();
    window.addEventListener("online", changed);
    document.addEventListener("visibilitychange", changed);
    void check();
    const client = getBrowserClient(),
      channel = client
        ?.channel(`phone-${session.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "project_assets",
            filter: `upload_session_id=eq.${session.id}`,
          },
          () => void check(),
        )
        .subscribe();
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("online", changed);
      document.removeEventListener("visibilitychange", changed);
      if (channel) void client?.removeChannel(channel);
    };
  }, [session.id]);
  return (
    <section className="phone-session" aria-label="Phone upload session">
      <QrCode url={session.url!} label="Scan to send photos" />
      <p>
        Expires at {new Date(session.expires_at).toLocaleTimeString()}. Anyone
        with this temporary link can send up to {session.max_count} photos.
      </p>
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      <button
        className="secondary"
        onClick={() =>
          void cloudRequest(`uploads/${session.id}`, { method: "DELETE" })
            .then(onClose)
            .catch((f) => setError(f.message))
        }
      >
        End upload session
      </button>
    </section>
  );
}
