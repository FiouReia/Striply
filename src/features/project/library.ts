import type { SavedProject } from "./persistence";
import type { CloudExport } from "../cloud/types";
export interface LocalProject {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail: Blob | null;
  exports: CloudExport;
  record: SavedProject;
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("striply-local-library", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("projects");
      request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Local projects could not be opened."));
  });
}
export async function listLocalProjects(): Promise<
  Omit<LocalProject, "record">[]
> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readonly"),
        request = tx.objectStore("projects").getAll();
      request.onsuccess = () =>
        resolve(
          request.result.map(({ record, ...metadata }: LocalProject) => {
            void record;
            return metadata;
          }),
        );
      request.onerror = () =>
        reject(new Error("Local projects could not be read."));
    });
  } finally {
    db.close();
  }
}
export async function readLocalProject(id: string): Promise<LocalProject> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["projects", "files"], "readonly"),
        request = tx.objectStore("projects").get(id);
      let value: LocalProject;
      request.onsuccess = () => {
        if (!request.result) {
          reject(new Error("This local project is unavailable."));
          return;
        }
        value = {
          ...request.result,
          record: { project: request.result.record.project, files: [] },
        };
        for (const source of request.result.record.fileIds) {
          const file = tx.objectStore("files").get(source);
          file.onsuccess = () => {
            if (file.result)
              value.record.files.push({ id: source, file: file.result });
          };
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(new Error("Local project could not be read."));
    });
  } finally {
    db.close();
  }
}
export async function writeLocalProject(value: LocalProject) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["projects", "files"], "readwrite");
      tx.objectStore("projects").put(
        {
          ...value,
          record: {
            project: value.record.project,
            fileIds: value.record.files.map((f) => f.id),
          },
        },
        value.id,
      );
      for (const source of value.record.files) {
        const request = tx.objectStore("files").getKey(source.id);
        request.onsuccess = () => {
          if (request.result === undefined)
            tx.objectStore("files").put(source.file, source.id);
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Device saving failed. Free storage and retry."));
    });
  } finally {
    db.close();
  }
}
export async function deleteLocalProject(id: string) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["projects", "files"], "readwrite");
      tx.objectStore("projects").delete(id);
      const request = tx.objectStore("projects").getAll();
      request.onsuccess = () => {
        const retained = new Set(
          request.result.flatMap((row) => row.record.fileIds),
        );
        const keys = tx.objectStore("files").getAllKeys();
        keys.onsuccess = () =>
          keys.result.forEach((key) => {
            if (!retained.has(key)) tx.objectStore("files").delete(key);
          });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error("Local project could not be deleted."));
    });
  } finally {
    db.close();
  }
}
