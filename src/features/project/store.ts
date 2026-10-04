import { newProject, photoMetadata, type StriplyProject } from "./model";
import { commitHistory, undoHistory, redoHistory, type HistoryState } from "./history";
import { releasePhoto } from "../photos/load";
import type { Photo } from "../photos/types";
export const RESOURCE_BUDGET = 160 * 1024 * 1024;
export function createProjectStore() {
 let state: HistoryState = { present: newProject(), past: [], future: [], group: null };
 const resources = new Map<string, Photo>(); const listeners = new Set<() => void>();
 function publish(next: HistoryState) {
  if (next === state) return; state = next;
  const referenced = () => new Set([state.present, ...state.past, ...state.future].flatMap(p => p.photos.flatMap(photo => photo ? [photo.id] : [])));
  const bytes = () => [...referenced()].reduce((sum, id) => { const photo = resources.get(id); return sum + (photo ? photo.file.size + photo.preview.width * photo.preview.height * 4 : 0); }, 0);
  // Trim oldest undo/farthest redo before releasing sources; never evict current photos.
  while ((state.past.length || state.future.length) && bytes() > RESOURCE_BUDGET) {
   state = state.past.length ? { ...state, past: state.past.slice(1) } : { ...state, future: state.future.slice(0, -1) };
  }
  const retained = referenced();
  resources.forEach((photo, id) => { if (!retained.has(id)) { releasePhoto(photo); resources.delete(id); } });
  listeners.forEach(notify => notify());
 }
 return {
  getSnapshot: () => state,
  subscribe: (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; },
  resources,
  commit: (patch: Partial<StriplyProject>, group: string | null = null) => publish(commitHistory(state, { ...state.present, ...patch }, group)),
  endGroup: () => { state = { ...state, group: null }; },
  undo: () => publish(undoHistory(state)), redo: () => publish(redoHistory(state)),
  replacePhotos: (photos: (Photo | null)[], group: string | null = null) => {
   photos.forEach(photo => { if (photo && !resources.has(photo.id)) resources.set(photo.id, photo); });
   publish(commitHistory(state, { ...state.present, photos: photos.map(photo => photo ? photoMetadata(photo) : null) }, group));
  },
  restore: (project: StriplyProject, photos: Photo[]) => {
   resources.forEach(releasePhoto); resources.clear(); photos.forEach(photo => resources.set(photo.id, photo));
   state = { present: project, past: [], future: [], group: null }; listeners.forEach(notify => notify());
  },
  dispose: () => { resources.forEach(releasePhoto); resources.clear(); },
 };
}
export type ProjectStore = ReturnType<typeof createProjectStore>;
