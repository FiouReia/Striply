"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../auth/provider";
import {
  serializeProject,
  hydrateProject,
  projectRepository,
} from "../project/persistence";
import type { ProjectStore } from "../project/store";
import type { StriplyProject } from "../project/model";
import { releasePhoto } from "../photos/load";
import { writeLocalProject } from "../project/library";
import { newProject } from "../project/model";
import {
  CloudError,
  type CloudExport,
  type CloudLink,
  type CloudProject,
} from "./types";
import { cloudRequest } from "./api";
import {
  clearPending,
  getPending,
  putPending,
  getLink,
  putLink,
  type PendingSync,
} from "./pending";
import { loadCloudProject, projectThumbnail, saveCloud } from "./projects";
export function useCloud(
  store: ProjectStore,
  project: StriplyProject,
  exports: CloudExport,
  onExports: (value: CloudExport) => void,
  localReady: boolean,
) {
  const router = useRouter();
  const auth = useAuth(),
    owner = auth.session?.user.id;
  const [link, setLink] = useState<CloudLink | null>(null),
    [status, setStatus] = useState("Local only"),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false),
    [loadingProject, setLoadingProject] = useState(false),
    [failedProject, setFailedProject] = useState(""),
    [pending, setPending] = useState<PendingSync | null>(null),
    [online, setOnline] = useState(true);
  const operation = useRef(false),
    alive = useRef(true),
    linkRef = useRef(link),
    exportRef = useRef(exports),
    ownerRef = useRef(owner),
    controller = useRef<AbortController | null>(null),
    lastQuery = useRef(""),
    attempted = useRef(""),
    resumed = useRef("");
  useEffect(() => {
    linkRef.current = link;
    exportRef.current = exports;
    ownerRef.current = owner;
  }, [link, exports, owner]);
  useEffect(() => {
    alive.current = true;
    const changed = () => {
      if (navigator.onLine) resumed.current = "";
      setOnline(navigator.onLine);
    };
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    void Promise.resolve().then(changed);
    return () => {
      alive.current = false;
      controller.current?.abort();
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  useEffect(() => {
    let current = true;
    if (owner)
      void Promise.all([
        getPending(owner, project.id),
        getLink(owner, project.id),
      ])
        .then(([value, savedLink]) => {
          if (current) {
            setPending(value);
            const existing = value?.link ?? savedLink;
            if (existing) {
              setLink(existing);
              linkRef.current = existing;
              setStatus(value ? "Sync pending" : "Saved to cloud");
              onExports(existing.exports);
            }
          }
        })
        .catch(() => {
          if (current)
            setError(
              "Pending sync could not be read. Local editing remains available.",
            );
        });
    return () => {
      current = false;
    };
  }, [owner, project.id, onExports]);
  const save = useCallback(
    async (copy = false) => {
      const actor = ownerRef.current;
      if (!actor) {
        try {
          if (!localReady)
            throw new Error(
              "Choose Restore or Start New before signing in from this project.",
            );
          await projectRepository.write(serializeProject(store));
          sessionStorage.setItem("striply-auth-return", "/");
          router.push("/sign-in");
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Save your project locally before signing in.",
          );
        }
        return;
      }
      if (operation.current) return;
      operation.current = true;
      setBusy(true);
      setError("");
      try {
        const record = serializeProject(store);
        let current = linkRef.current;
        const copiedFrom =
          copy && current?.ownerId === actor ? current.projectId : null;
        if (current && current.ownerId !== actor) {
          record.project = { ...record.project, id: crypto.randomUUID() };
          store.commit({ id: record.project.id });
          current = null;
        }
        if (copy) {
          const id = crypto.randomUUID();
          record.project = { ...record.project, id };
          current = null;
          store.commit({ id });
        }
        if (
          !current ||
          current.ownerId !== actor ||
          current.projectId !== record.project.id
        )
          current = {
            ownerId: actor,
            projectId: record.project.id,
            name: record.project.settings.title || "My photo strip",
            revision: 0,
            assets: {},
            thumbnail: null,
            exports: exportRef.current,
            syncedAt: "",
          };
        current = { ...current, exports: exportRef.current };
        const work = {
          ownerId: actor,
          record,
          link: current,
          queuedAt: new Date().toISOString(),
        };
        await putPending(work);
        resumed.current = `${actor}:${work.queuedAt}`;
        if (!alive.current || ownerRef.current !== actor) return;
        setPending(work);
        setLink(current);
        linkRef.current = current;
        if (!navigator.onLine) {
          setStatus("Offline - saved locally, sync pending");
          return;
        }
        setStatus("Syncing...");
        const thumbnail = await projectThumbnail(store, current.exports),
          saved = await saveCloud(record, current, thumbnail);
        if (!alive.current || ownerRef.current !== actor) return;
        await putLink(saved);
        await clearPending(actor, current.projectId);
        if (copiedFrom) await clearPending(actor, copiedFrom);
        setPending(null);
        setLink(saved);
        linkRef.current = saved;
        setStatus("Saved to cloud");
        setConflict(false);
        return saved;
      } catch (failure) {
        if (alive.current) {
          if (failure instanceof CloudError && failure.status === 409) {
            setConflict(true);
            setStatus("Conflict - local version kept");
          } else setStatus("Sync error - local version kept");
          setError(
            failure instanceof Error
              ? failure.message
              : "Cloud saving failed. Retry.",
          );
        }
      } finally {
        operation.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [store, router, localReady],
  );
  useEffect(() => {
    if (
      !localReady ||
      !owner ||
      link?.ownerId !== owner ||
      link.projectId !== project.id ||
      loadingProject ||
      conflict ||
      busy ||
      (project.updatedAt === link.syncedAt &&
        JSON.stringify(exports) === JSON.stringify(link.exports))
    )
      return;
    const key = `${owner}:${project.id}:${project.updatedAt}:${JSON.stringify(exports)}`;
    if (attempted.current === key) return;
    const timer = setTimeout(() => {
      attempted.current = key;
      void save();
    }, 1800);
    return () => clearTimeout(timer);
  }, [
    project,
    link,
    owner,
    localReady,
    loadingProject,
    conflict,
    busy,
    exports,
    save,
  ]);
  useEffect(() => {
    if (
      online &&
      pending &&
      pending.ownerId === owner &&
      pending.record.project.id === project.id &&
      !conflict &&
      !busy &&
      localReady
    ) {
      const key = `${owner}:${pending.queuedAt}`;
      if (resumed.current !== key) {
        resumed.current = key;
        void save();
      }
    }
  }, [online, pending, owner, project.id, conflict, busy, localReady, save]);
  const open = useCallback(
    async (id: string, useCloudVersion = false) => {
      if (operation.current) return;
      operation.current = true;
      setBusy(true);
      setLoadingProject(true);
      setFailedProject("");
      setError("");
      const abort = new AbortController();
      controller.current = abort;
      try {
        const actor = ownerRef.current;
        if (!actor) throw new Error("Sign in to open cloud projects.");
        const work = await getPending(actor, id);
        if (work && !useCloudVersion) {
          const result = await hydrateProject(work.record);
          if (!alive.current) {
            result.photos.forEach(releasePhoto);
            return;
          }
          store.restore(result.project, result.photos);
          setLink(work.link);
          linkRef.current = work.link;
          setPending(work);
          onExports(work.link.exports);
          setStatus("Sync pending - restored local edits");
          return;
        }
        if (work && useCloudVersion) {
          const copyId = crypto.randomUUID();
          await writeLocalProject({
            id: copyId,
            name: `${work.link.name.slice(0, 60)} (local conflict)`,
            updatedAt: work.record.project.updatedAt,
            thumbnail: null,
            exports: work.link.exports,
            record: {
              ...work.record,
              project: { ...work.record.project, id: copyId },
            },
          });
          await clearPending(actor, id);
        }
        const row = await loadCloudProject(id, store, setStatus, abort.signal);
        if (!alive.current) return;
        const value = {
          ownerId: row.owner_id,
          projectId: row.id,
          revision: row.revision,
          name: row.name,
          assets: row.photo_assets,
          thumbnail: row.thumbnail_asset_id,
          exports: row.export_settings,
          syncedAt: row.document.updatedAt,
        };
        setLink(value);
        linkRef.current = value;
        await putLink(value);
        onExports(row.export_settings);
        setConflict(false);
        setStatus("Saved to cloud");
        setPending(null);
      } catch (failure) {
        if (alive.current) {
          setFailedProject(id);
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not open project.",
          );
        }
      } finally {
        operation.current = false;
        if (alive.current) {
          setBusy(false);
          setLoadingProject(false);
        }
      }
    },
    [store, onExports],
  );
  useEffect(() => {
    if (!localReady || !owner) return;
    const query = new URLSearchParams(location.search),
      id = query.get("cloud");
    if (id && lastQuery.current !== id) {
      lastQuery.current = id;
      void open(id);
    }
  }, [localReady, owner, open]);
  async function resume() {
    if (!pending) return;
    const result = await hydrateProject(pending.record);
    store.restore(result.project, result.photos);
    setLink(pending.link);
    linkRef.current = pending.link;
    onExports(pending.link.exports);
    setStatus("Sync pending");
  }
  async function newCloudProject() {
    const row = newProject();
    store.restore(row, []);
    setLink(null);
    linkRef.current = null;
    setConflict(false);
    return row;
  }
  async function ensureProject() {
    const value = await save();
    if (!value?.revision)
      throw new Error(
        "Save this project successfully to cloud first. Resolve any sync error or conflict.",
      );
    return value;
  }
  return {
    auth,
    owner,
    link,
    localReady,
    status:
      link && link.ownerId !== owner
        ? "Local only"
        : !online && link
          ? "Offline - changes saved locally"
          : status,
    error,
    conflict,
    busy,
    loadingProject,
    failedProject,
    pending,
    online,
    save,
    open,
    resume,
    newCloudProject,
    ensureProject,
    registerAssets: (
      assets: Record<string, import("./types").PhotoReference>,
    ) => {
      const current = linkRef.current;
      if (current) {
        const next = { ...current, assets: { ...current.assets, ...assets } };
        linkRef.current = next;
        setLink(next);
      }
    },
    request: cloudRequest<CloudProject>,
  };
}
