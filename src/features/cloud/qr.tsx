"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
export function QrCode({
  url,
  label = "Scan to download",
}: {
  url: string;
  label?: string;
}) {
  const [image, setImage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#243b2aff", light: "#ffffffff" },
    })
      .then((value) => {
        if (alive) setImage(value);
      })
      .catch(() => {
        if (alive)
          setError("QR code could not be generated. Use the link below.");
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="qr-delivery">
      <strong>{label}</strong>
      {error && <p role="status">{error}</p>}
      {image && (
        <img width="280" height="280" src={image} alt={`QR code: ${label}`} />
      )}
      <a href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
      <button
        className="secondary"
        onClick={() => void navigator.clipboard?.writeText(url)}
      >
        Copy link
      </button>
    </div>
  );
}
