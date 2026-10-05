import { migrateProject, type StriplyProject } from "./model";
import type { ProjectStore } from "./store";
import { loadPhoto, releasePhoto, validateFile } from "../photos/load";
import type { Photo } from "../photos/types";
export interface SavedProject { project: StriplyProject; files: { id: string; file: Blob }[] }
export interface ProjectRepository { read: () => Promise<SavedProject | null>; write: (record: SavedProject) => Promise<void>; clear: () => Promise<void> }
function openDatabase(): Promise<IDBDatabase> {
 return new Promise((resolve, reject) => {
  if (!("indexedDB" in globalThis)) { reject(new Error("Local saving is not available in this browser.")); return; }
  const request = indexedDB.open("striply-projects", 2);
  request.onupgradeneeded = () => { for (const name of ["projects", "photo-files"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); };
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Local storage could not be opened.")); request.onblocked = () => reject(new Error("Close other Striply tabs and retry local saving."));
 });
}
export const projectRepository: ProjectRepository = {
 async read() {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => {
   const tx = db.transaction(["projects", "photo-files"], "readonly"), request = tx.objectStore("projects").get("unfinished");
   let record: SavedProject | null = null;
   request.onsuccess = () => {
    const stored = request.result; if (!stored) return;
    record = { project: stored.project, files: stored.files ?? [] };
    if (!stored.files) for (const id of stored.fileIds ?? []) {
     const fileRequest = tx.objectStore("photo-files").get(id);
     fileRequest.onsuccess = () => { if (fileRequest.result) record!.files.push({ id, file: fileRequest.result }); };
    }
   };
   tx.oncomplete = () => resolve(record); tx.onerror = () => reject(new Error("Your saved project could not be read.")); tx.onabort = () => reject(new Error("Reading the saved project was interrupted."));
  }); } finally { db.close(); }
 },
 async write(record) {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => {
   const tx = db.transaction(["projects", "photo-files"], "readwrite"), files = tx.objectStore("photo-files");
   tx.objectStore("projects").put({ project: record.project, fileIds: record.files.map(file => file.id) }, "unfinished");
   // New sources are written once; metadata edits do not rewrite image blobs.
   for (const item of record.files) { const request = files.getKey(item.id); request.onsuccess = () => { if (request.result === undefined) files.put(item.file, item.id); }; }
   const retained = new Set(record.files.map(file => file.id)), keys = files.getAllKeys();
   keys.onsuccess = () => keys.result.forEach(key => { if (!retained.has(String(key))) files.delete(key); });
   tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error("Autosave failed. Free some device storage and retry.")); tx.onabort = () => reject(new Error("Autosave was interrupted. Retry saving."));
  }); } finally { db.close(); }
 },
 async clear() {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => {
   const tx = db.transaction(["projects", "photo-files"], "readwrite"); tx.objectStore("projects").delete("unfinished"); tx.objectStore("photo-files").clear();
   tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error("The saved project could not be cleared.")); tx.onabort = () => reject(new Error("Clearing the saved project was interrupted."));
  }); } finally { db.close(); }
 },
};
export function serializeProject(store: ProjectStore): SavedProject {
 const project = structuredClone(store.getSnapshot().present);
 const files = [...project.photos, project.event?.logoPhoto].flatMap(photo => {
  if (!photo) return []; const resource = store.resources.get(photo.id); if(resource?.cloudPreview)throw new Error("Cloud originals are still loading. Retry loading before saving or exporting."); if (!resource) throw new Error("A photo source is unavailable. Replace the photo and retry saving.");
  return [{ id: photo.id, file: resource.file }];
 });
 return { project, files };
}
export async function hydrateProject(record: SavedProject): Promise<{ project: StriplyProject; photos: Photo[] }> {
 const project = migrateProject(record.project), photos: Photo[] = [];
 try {
  if (!Array.isArray(record.files)) throw new Error("The saved photo files are missing.");
  for (const metadata of [...project.photos, project.event?.logoPhoto]) {
   if (!metadata) continue; const item = record.files.find(file => file.id === metadata.id);
   if (!item || !(item.file instanceof Blob) || validateFile(item.file as File)) throw new Error("A saved photo source is invalid. Your saved project has been kept.");
   const file = item.file instanceof File ? item.file : new File([item.file], "saved-photo.png", { type: item.file.type });
   const photo = await loadPhoto(file); photos.push({ ...photo, id: metadata.id, transform: metadata.transform, effects: metadata.effects });
  }
  return { project, photos };
 } catch (error) { photos.forEach(releasePhoto); throw error; }
}
export function createSaveQueue(repository: ProjectRepository) {
 let pending = Promise.resolve();
 return { write(record: SavedProject) { const result = pending.then(() => repository.write(record)); pending = result.catch(() => {}); return result; }, clear() { const result = pending.then(() => repository.clear()); pending = result.catch(() => {}); return result; } };
}
