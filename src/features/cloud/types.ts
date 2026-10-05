import type { StriplyProject } from "../project/model";
export interface CloudExport {
  format: "strip" | "sheet";
  mimeType: "image/png" | "image/jpeg";
  resolution: "digital" | "high" | "print";
  quality: number;
  cutGuide: boolean;
}
export const defaultCloudExport: CloudExport = {
  format: "strip",
  mimeType: "image/png",
  resolution: "print",
  quality: 0.92,
  cutGuide: false,
};
export interface Asset {
  id: string;
  project_id: string | null;
  source_id: string | null;
  asset_type: "original" | "preview" | "export" | "logo";
  object_path: string;
  mime_type: string;
  bytes: number;
  width: number;
  height: number;
  upload_session_id?: string;
}
export interface PhotoReference {
  original: string;
  preview?: string;
}
export interface CloudProject {
  id: string;
  owner_id: string;
  name: string;
  document: StriplyProject;
  photo_assets: Record<string, PhotoReference>;
  export_settings: CloudExport;
  revision: number;
  updated_at: string;
  thumbnail_asset_id: string | null;
}
export interface EventRecord {
  id: string;
  name: string;
  event_date: string | null;
  template_id: string;
  layout_id: string;
  background: string;
  foreground: string;
  allow_customization: boolean;
  gallery_visibility: "private" | "link" | "public";
  logo_asset_id: string | null;
  session_count?: number;
  share_visibility?: "private" | "link";
  share_days?: number;
  auto_delivery?: boolean;
  gallery_url?: string;
}
export interface ShareRecord {
  id: string;
  url: string;
  expires_at: string | null;
  visibility: "private" | "link";
}
export interface UploadSession {
  id: string;
  url?: string;
  status: string;
  expires_at: string;
  max_count: number;
  reserved_count: number;
}
export interface CloudLink {
  ownerId: string;
  projectId: string;
  revision: number;
  name: string;
  assets: Record<string, PhotoReference>;
  thumbnail: string | null;
  exports: CloudExport;
  syncedAt: string;
}
export class CloudError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "CloudError";
  }
}
export function revisionMatches(expected: number, actual: number) {
  return expected === actual;
}
export function activeShare(
  share: { visibility: string; status: string; expires_at: string | null },
  now = Date.now(),
) {
  return (
    share.visibility === "link" &&
    share.status === "active" &&
    (!share.expires_at || Date.parse(share.expires_at) > now)
  );
}
export function validUploadSession(
  session: Pick<
    UploadSession,
    "status" | "expires_at" | "reserved_count" | "max_count"
  >,
  now = Date.now(),
) {
  return (
    session.status === "active" &&
    Date.parse(session.expires_at) > now &&
    session.reserved_count < session.max_count
  );
}
export function shareExpiry(days: number, now = Date.now()) {
  if (![0, 1, 7, 30].includes(days))
    throw new CloudError("Choose a valid expiration.", 400);
  return days ? new Date(now + days * 86400000).toISOString() : null;
}
