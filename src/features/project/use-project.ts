"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createProjectStore } from "./store";
export function useProject() {
 const [store] = useState(createProjectStore);
 const history = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
 const photos = useMemo(() => history.present.photos.map(metadata => {
  if (!metadata) return null; const resource = store.resources.get(metadata.id);
  return resource ? { ...resource, transform: metadata.transform, effects: metadata.effects } : null;
 }), [history, store]);
 useEffect(() => () => store.dispose(), [store]);
 return { store, history, project: history.present, photos };
}
