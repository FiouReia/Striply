"use client";
import { useEffect, useState } from "react";
import { cloudRequest } from "./api";
interface OwnerShare {
  id: string;
  project_id: string;
  expires_at: string | null;
  visibility: string;
  status: string;
  created_at: string;
}
export function ManageShares() {
  const [shares, setShares] = useState<OwnerShare[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void cloudRequest<OwnerShare[]>("shares")
      .then((value) => {
        if (alive) setShares(value);
      })
      .catch((f) => {
        if (alive) setError(f.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <details className="profile-settings">
      <summary>Manage shared strips</summary>
      <p>
        You can revoke any existing link. Create a new link from the editor when
        needed.
      </p>
      {shares.map((share) => (
        <article className="share-row" key={share.id}>
          <p>
            {new Date(share.created_at).toLocaleString()} · {share.visibility} ·{" "}
            {share.status} ·{" "}
            {share.expires_at
              ? `expires ${new Date(share.expires_at).toLocaleDateString()}`
              : "no expiration"}
          </p>
          <button
            className="secondary"
            disabled={share.status !== "active"}
            onClick={() =>
              void cloudRequest(`shares/${share.id}`, { method: "DELETE" })
                .then(() =>
                  setShares((rows) =>
                    rows.map((row) =>
                      row.id === share.id ? { ...row, status: "revoked" } : row,
                    ),
                  ),
                )
                .catch((f) => setError(f.message))
            }
          >
            Revoke link
          </button>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
