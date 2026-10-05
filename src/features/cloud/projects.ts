import { getLayout } from "../collage/layout";
import { assetBlob, cloudRequest, uploadAsset } from "./api";
import type {
  CloudLink,
  CloudProject,
  CloudExport,
  PhotoReference,
} from "./types";
import type { SavedProject } from "../project/persistence";
import { migrateProject } from "../project/model";
import { loadPhoto, releasePhoto } from "../photos/load";
import type { Photo } from "../photos/types";
import type { ProjectStore } from "../project/store";
import { renderCollage } from "../collage/render";
import { loadStickerAssets } from "../layers/stickers";
export async function imagePreview(photo: Photo): Promise<Blob> {
  const canvas = document.createElement("canvas"),
    ratio = Math.min(
      1,
      480 / Math.max(photo.preview.width, photo.preview.height),
    );
  canvas.width = Math.round(photo.preview.width * ratio);
  canvas.height = Math.round(photo.preview.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare a preview.");
  ctx.drawImage(photo.preview, 0, 0, canvas.width, canvas.height);
  try {
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not prepare a preview.")),
        photo.file.type === "image/png" ? "image/png" : "image/jpeg",
        0.8,
      ),
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}
export async function saveCloud(
  record: SavedProject,
  link: CloudLink,
  thumbnail: Blob | null,
  signal?: AbortSignal,
): Promise<CloudLink> {
  const document = migrateProject(record.project),
    refs: Record<string, PhotoReference> = {};
  let revision = link.revision;
  const update = (
    photos: Record<string, PhotoReference>,
    thumb: string | null,
  ) =>
    cloudRequest<CloudProject>(`projects/${document.id}`, {
      method: "PUT",
      signal,
      body: JSON.stringify({
        name: link.name,
        document,
        photo_assets: photos,
        export_settings: link.exports,
        revision,
        thumbnail_asset_id: thumb,
      }),
    });
  if (!revision) {
    const existing = await cloudRequest<CloudProject>(
      `projects/${document.id}`,
      { signal },
    ).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
    if (existing) {
      if (
        existing.document.updatedAt !== document.updatedAt ||
        Object.keys(existing.photo_assets).length
      )
        throw new (await import("./types")).CloudError(
          "This project already exists. Save as a copy.",
          409,
        );
      revision = existing.revision;
    } else {
      const created = await update({}, null);
      revision = created.revision;
    }
  }
  // Detect conflicts before large uploads; the final RPC still compares atomically.
  const current = await cloudRequest<CloudProject>(`projects/${document.id}`, {
    signal,
  });
  if (current.revision !== revision) {
    const { CloudError } = await import("./types");
    throw new CloudError("This project changed on another device.", 409);
  }
  for (const metadata of [...document.photos, document.event?.logoPhoto]) {
    if (!metadata) continue;
    const old = link.assets[metadata.id];
    if (old) {
      refs[metadata.id] = old;
      continue;
    }
    const file = record.files.find((f) => f.id === metadata.id);
    if (!file) throw new Error("An original image is unavailable.");
    const original = await uploadAsset(
      file.file,
      document.id,
      "original",
      metadata.id,
    );
    const photo = await loadPhoto(
      new File([file.file], "source", { type: file.file.type }),
    );
    try {
      const preview = await uploadAsset(
        await imagePreview(photo),
        document.id,
        "preview",
        metadata.id,
      );
      refs[metadata.id] = { original: original.id, preview: preview.id };
    } finally {
      releasePhoto(photo);
    }
  }
  const thumb = thumbnail
    ? (await uploadAsset(thumbnail, document.id, "preview")).id
    : link.thumbnail;
  const saved = await update(refs, thumb);
  return {
    ...link,
    revision: saved.revision,
    assets: refs,
    thumbnail: thumb,
    syncedAt: document.updatedAt,
  };
}
export async function projectThumbnail(
  store: ProjectStore,
  settings: CloudExport,
) {
  const project = store.getSnapshot().present,
    photos = project.photos
      .slice(0, getLayout(project.layoutId).photoCount)
      .map((p) => (p ? store.resources.get(p.id) : null));
  if (photos.some((p) => !p)) return null;
  const canvas = document.createElement("canvas");
  const assets = project.layers.some((layer) => layer.type === "sticker")
    ? await loadStickerAssets()
    : undefined;
  try {
    renderCollage(
      canvas,
      photos.filter((p): p is Photo => !!p),
      project.settings,
      settings.format,
      undefined,
      0.2,
      {
        layoutId: project.layoutId,
        layers: project.layers,
        assets,
        logo: project.event?.logoPhoto
          ? store.resources.get(project.event.logoPhoto.id)
          : undefined,
      },
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not prepare a project thumbnail.")),
        "image/jpeg",
        0.8,
      ),
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}
export async function loadCloudProject(
  id: string,
  store: ProjectStore,
  onProgress: (text: string) => void,
  signal: AbortSignal,
) {
  const row = await cloudRequest<CloudProject>(`projects/${id}`, { signal }),
    stored = migrateProject(row.document);
  const current = store.getSnapshot().present;
  const recovering =
    current.id === stored.id &&
    current.photos.some((p) => p && store.resources.get(p.id)?.cloudPreview);
  const project = recovering ? migrateProject(current) : stored;
  const photos: Photo[] = [];
  try {
    onProgress("Loading photo previews...");
    for (const metadata of [...project.photos, project.event?.logoPhoto]) {
      if (!metadata) continue;
      const reference = row.photo_assets[metadata.id];
      if (!reference)
        throw new Error(
          "This cloud project is missing an original. Your local project has been kept.",
        );
      const blob = await assetBlob(
        reference.preview ?? reference.original,
        signal,
      );
      const photo = await loadPhoto(
        new File([blob], "cloud-preview", { type: blob.type }),
      );
      photos.push({
        ...photo,
        cloudPreview: true,
        id: metadata.id,
        width: metadata.width,
        height: metadata.height,
        transform: metadata.transform,
        effects: metadata.effects,
      });
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    store.restore(project, photos);
    onProgress("Preview ready. Loading print originals...");
    const originals: Photo[] = [];
    try {
      for (const metadata of [...project.photos, project.event?.logoPhoto]) {
        if (!metadata) continue;
        const blob = await assetBlob(
          row.photo_assets[metadata.id].original,
          signal,
        );
        const photo = await loadPhoto(
          new File([blob], "cloud-original", { type: blob.type }),
        );
        originals.push({
          ...photo,
          id: metadata.id,
          transform: metadata.transform,
          effects: metadata.effects,
        });
      }
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const latest = store.getSnapshot().present;
      store.restore(latest, originals);
      return row;
    } catch (error) {
      originals.forEach(releasePhoto);
      throw error;
    }
  } catch (error) {
    if (store.getSnapshot().present.id !== project.id)
      photos.forEach(releasePhoto);
    throw error;
  }
}
