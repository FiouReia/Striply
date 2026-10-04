"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSaveQueue, hydrateProject, projectRepository, serializeProject, type SavedProject } from "./persistence";
import { newProject, type StriplyProject } from "./model";
import type { ProjectStore } from "./store";
import { releasePhoto } from "../photos/load";
export function useAutosave(store: ProjectStore, project: StriplyProject) {
 const [pending, setPending] = useState<SavedProject | null>(null), [ready, setReady] = useState(false), [status, setStatus] = useState("Checking local projects..."), [error, setError] = useState("");
 const [readError, setReadError] = useState(false);
 const [queue] = useState(() => createSaveQueue(projectRepository)); const alive = useRef(true);
 const checkPrevious = useCallback(async () => {
  try { const record = await projectRepository.read(); if (!alive.current) return; setReadError(false); setError(""); if (record) { setPending(record); setReady(false); setStatus("Previous project found"); } else { setReady(true); setStatus("Local autosave ready"); } }
  catch { if (alive.current) { setReady(false); setReadError(true); setError("Local saving could not be checked. Your previous project is kept; current edits are not being saved. Retry storage, or choose Start New to discard the previous save."); setStatus("Not saved"); } }
 }, []);
 useEffect(() => { alive.current = true; void Promise.resolve().then(checkPrevious); return () => { alive.current = false; }; }, [checkPrevious]);
 const save = useCallback(async () => {
  if (!ready) return;
  try { if (alive.current) setStatus("Saving on this device..."); await queue.write(serializeProject(store)); if (alive.current) { setStatus("Saved on this device"); setError(""); } }
  catch (failure) { if (alive.current) { setStatus("Not saved"); setError(failure instanceof Error ? failure.message : "Local saving failed. Retry saving."); } }
 }, [ready, queue, store]);
 useEffect(() => {
  if (!ready || (!project.photos.some(Boolean) && !project.layers.length)) return;
  const timer = setTimeout(() => { void save(); }, 700); return () => clearTimeout(timer);
 }, [project, ready, save]);
 async function restore() {
  if (!pending) return;
  try { const result = await hydrateProject(pending); if (!alive.current) { result.photos.forEach(releasePhoto); return; } store.restore(result.project, result.photos); setPending(null); setReady(true); setError(""); setStatus("Previous project restored"); }
  catch (failure) { setError(failure instanceof Error ? failure.message : "The saved project could not be restored. It has been kept."); }
 }
 async function startNew() {
  try { await queue.clear(); store.restore(newProject(), []); setPending(null); setReady(true); setReadError(false); setError(""); setStatus("New project ready"); }
  catch { setError("The previous project could not be cleared. Retry when storage is available."); }
 }
 return { pending, ready, status, error, readError, restore, startNew, save, retry: readError ? checkPrevious : save };
}
