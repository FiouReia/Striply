"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  deleteLocalProject,
  listLocalProjects,
  readLocalProject,
  writeLocalProject,
  type LocalProject,
} from "./library";
function Card({
  row,
  onChange,
  onError,
}: {
  row: Omit<LocalProject, "record">;
  onChange: () => void;
  onError: (error: string) => void;
}) {
  const [image, setImage] = useState("");
  useEffect(() => {
    if (!row.thumbnail) return;
    const url = URL.createObjectURL(row.thumbnail);
    void Promise.resolve().then(() => setImage(url));
    return () => URL.revokeObjectURL(url);
  }, [row.thumbnail]);
  async function action(kind: string) {
    try {
      if (kind === "delete") {
        if (
          !confirm(
            "Delete this saved device project? Your active editor is kept.",
          )
        )
          return;
        await deleteLocalProject(row.id);
      } else {
        const value = await readLocalProject(row.id);
        if (kind === "rename") {
          const name = prompt("Project name", row.name);
          if (!name) return;
          value.name = name.slice(0, 80);
        } else {
          value.id = crypto.randomUUID();
          value.record.project = { ...value.record.project, id: value.id };
          value.name = `${value.name.slice(0, 70)} (copy)`;
        }
        await writeLocalProject(value);
      }
      onChange();
    } catch (failure) {
      onError(
        failure instanceof Error
          ? failure.message
          : "Could not update project.",
      );
    }
  }
  return (
    <article className="project-card">
      {image && <img src={image} alt={row.name} />}
      <h2>{row.name}</h2>
      <p>{new Date(row.updatedAt).toLocaleDateString()} · This device</p>
      <div className="card-actions">
        <Link className="primary" href={`/?local=${row.id}`}>
          Open
        </Link>
        <button className="secondary" onClick={() => void action("rename")}>
          Rename
        </button>
        <button className="secondary" onClick={() => void action("duplicate")}>
          Duplicate
        </button>
        <button className="text-button" onClick={() => void action("delete")}>
          Delete
        </button>
      </div>
    </article>
  );
}
export function LocalProjects() {
  const [rows, setRows] = useState<Omit<LocalProject, "record">[]>([]),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      setRows(await listLocalProjects());
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not open local projects.",
      );
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  return (
    <main className="account-page">
      <nav className="account-nav">
        <Link href="/">Create a strip</Link>
        <Link href="/account">Cloud Projects</Link>
      </nav>
      <h1>Local Projects</h1>
      <p>
        Saved in this browser on this device. No account needed. Clearing site
        data removes these projects.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="gallery-grid">
        {rows.map((row) => (
          <Card
            key={row.id}
            row={row}
            onChange={() => void refresh()}
            onError={setError}
          />
        ))}
      </div>
      {!rows.length && (
        <p>Choose Save on Device in the editor to keep a project here.</p>
      )}
    </main>
  );
}
