import { assetBlob, cloudRequest } from "./api";
import { saveCloud } from "./projects";
import type { CloudProject } from "./types";
export async function duplicateProject(project: CloudProject) {
  const document = {
      ...structuredClone(project.document),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    files = [];
  for (const photo of [...document.photos, document.event?.logoPhoto]) {
    if (!photo) continue;
    files.push({
      id: photo.id,
      file: await assetBlob(project.photo_assets[photo.id].original),
    });
  }
  const thumbnail = project.thumbnail_asset_id
    ? await assetBlob(project.thumbnail_asset_id)
    : null;
  await saveCloud(
    { project: document, files },
    {
      ownerId: project.owner_id,
      projectId: document.id,
      revision: 0,
      name: `${project.name.slice(0, 70)} (copy)`,
      assets: {},
      thumbnail: null,
      exports: project.export_settings,
      syncedAt: "",
    },
    thumbnail,
  );
  return cloudRequest<CloudProject>(`projects/${document.id}`);
}
