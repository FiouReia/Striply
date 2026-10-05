import type { SavedProject } from "../project/persistence";
import type { CloudLink } from "./types";
export interface PendingSync {
  ownerId: string;
  record: SavedProject;
  link: CloudLink;
  queuedAt: string;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("striply-cloud-sync", 2);
    request.onupgradeneeded = () => {
      for (const name of ["pending", "files", "links"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Pending sync could not be saved locally."));
  });
}
export async function putPending(value: PendingSync) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["pending", "files"], "readwrite"),
        files = tx.objectStore("files"),
        key = `${value.ownerId}:${value.link.projectId}`;
      tx.objectStore("pending").put(
        {
          ...value,
          record: {
            project: value.record.project,
            fileIds: value.record.files.map((f) => f.id),
          },
        },
        key,
      );
      for (const file of value.record.files) {
        const id = `${value.ownerId}:${file.id}`,
          request = files.getKey(id);
        request.onsuccess = () => {
          if (request.result === undefined) files.put(file.file, id);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(
          new Error(
            "Pending sync could not be saved locally. Retry after freeing device storage.",
          ),
        );
    });
  } finally {
    db.close();
  }
}
export async function getPending(
  ownerId: string,
  projectId?: string,
): Promise<PendingSync | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["pending", "files"], "readonly");
      let result: PendingSync | null = null;
      const request = projectId
        ? tx.objectStore("pending").get(`${ownerId}:${projectId}`)
        : tx.objectStore("pending").getAll();
      request.onsuccess = () => {
        const value = projectId
          ? request.result
          : request.result.find((v: PendingSync) => v.ownerId === ownerId);
        if (!value) return;
        result = {
          ...value,
          record: { project: value.record.project, files: [] },
        };
        for (const id of value.record.fileIds) {
          const file = tx.objectStore("files").get(`${ownerId}:${id}`);
          file.onsuccess = () => {
            if (file.result)
              result!.record.files.push({ id, file: file.result });
          };
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new Error("Pending sync could not be read."));
    });
  } finally {
    db.close();
  }
}
export async function clearPending(ownerId: string, projectId: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["pending", "files"], "readwrite");
      tx.objectStore("pending").delete(`${ownerId}:${projectId}`);
      const request = tx.objectStore("pending").getAll();
      request.onsuccess = () => {
        const retained = new Set(
          request.result.flatMap((v) =>
            v.record.fileIds.map((id: string) => `${v.ownerId}:${id}`),
          ),
        );
        const keys = tx.objectStore("files").getAllKeys();
        keys.onsuccess = () =>
          keys.result.forEach((key) => {
            if (!retained.has(String(key))) tx.objectStore("files").delete(key);
          });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Sync cleanup failed."));
    });
  } finally {
    db.close();
  }
}

export async function putLink(link: CloudLink) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("links", "readwrite");
      tx.objectStore("links").put(link, `${link.ownerId}:${link.projectId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("Cloud linkage could not be saved."));
    });
  } finally {
    db.close();
  }
}
export async function getLink(
  owner: string,
  id: string,
): Promise<CloudLink | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("links", "readonly"),
        r = tx.objectStore("links").get(`${owner}:${id}`);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(new Error("Cloud linkage could not be read."));
    });
  } finally {
    db.close();
  }
}
