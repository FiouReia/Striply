import {
  activeShare,
  CloudError,
  validUploadSession,
} from "@/features/cloud/types";
import { adminClient, checked, noStore, rateLimit } from "./clients";
import { readImageForm, tokenHash, uuid } from "./security";
import { storeAsset } from "./private";
async function shareForToken(token: string) {
  const admin = adminClient(),
    share = checked(
      await admin
        .from("shares")
        .select("*")
        .eq("token_hash", tokenHash(token))
        .maybeSingle(),
    );
  if (!share || !activeShare(share))
    throw new CloudError(
      "This strip is private, unavailable or the link has expired.",
      404,
    );
  return share;
}
async function imageResponse(
  assetId: string,
  download: boolean,
  expected = "export",
) {
  const admin = adminClient(),
    asset = checked(
      await admin
        .from("project_assets")
        .select("*")
        .eq("id", uuid(assetId))
        .single(),
    );
  if (!asset || asset.asset_type !== expected)
    throw new CloudError("This strip is unavailable.", 404);
  const blob = checked(
    await admin.storage.from("striply-private").download(asset.object_path),
  );
  return new Response(blob, {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="striply.${asset.mime_type === "image/jpeg" ? "jpg" : "png"}"`,
    },
  });
}
export async function publicRequest(request: Request, path: string[]) {
  const [resource, token, action, item] = path;
  if (!["shares", "galleries", "uploads"].includes(resource))
    throw new CloudError("This link is unavailable.", 404);
  tokenHash(token);
  await rateLimit(
    request,
    `public:${resource}`,
    resource === "uploads" ? 30 : 240,
  );
  if (resource === "shares" && request.method === "GET") {
    const share = await shareForToken(token);
    if (action === "image") {
      const params = new URL(request.url).searchParams,
        preview =
          params.has("preview") &&
          !params.has("download") &&
          share.preview_asset_id;
      return imageResponse(
        preview || share.asset_id,
        params.has("download"),
        preview ? "preview" : "export",
      );
    }
    let event = null;
    if (share.event_id)
      event = checked(
        await adminClient()
          .from("events")
          .select("name,event_date,logo_asset_id")
          .eq("id", share.event_id)
          .maybeSingle(),
      );
    if (action === "logo" && event?.logo_asset_id)
      return imageResponse(event.logo_asset_id, false, "logo");
    return noStore({
      image: `/api/public/shares/${token}/image?preview=1`,
      expires_at: share.expires_at,
      event: event
        ? {
            name: event.name,
            event_date: event.event_date,
            logo: event.logo_asset_id
              ? `/api/public/shares/${token}/logo`
              : null,
          }
        : null,
    });
  }
  if (resource === "galleries" && request.method === "GET") {
    const admin = adminClient(),
      event = checked(
        await admin
          .from("events")
          .select("id,name,event_date,gallery_visibility")
          .eq("gallery_token_hash", tokenHash(token))
          .maybeSingle(),
      );
    if (!event || event.gallery_visibility === "private")
      throw new CloudError("This gallery is private or unavailable.", 404);
    const shares = checked(
      await admin
        .from("shares")
        .select(
          "id,asset_id,preview_asset_id,visibility,status,expires_at,created_at",
        )
        .eq("event_id", event.id)
        .eq("visibility", "link")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100),
    ).filter((s) => activeShare(s));
    if (action === "image") {
      const share = shares.find((s) => s.id === uuid(item));
      if (!share)
        throw new CloudError("This strip is no longer available.", 404);
      const params = new URL(request.url).searchParams,
        preview =
          params.has("preview") &&
          !params.has("download") &&
          share.preview_asset_id;
      return imageResponse(
        preview || share.asset_id,
        params.has("download"),
        preview ? "preview" : "export",
      );
    }
    return noStore({
      event: { name: event.name, date: event.event_date },
      items: shares.map((s) => ({
        id: s.id,
        created_at: s.created_at,
        image: `/api/public/galleries/${token}/image/${s.id}?preview=1`,
      })),
    });
  }
  if (resource === "uploads") {
    const hash = tokenHash(token),
      admin = adminClient();
    if (request.method === "GET") {
      const session = checked(
        await admin
          .from("upload_sessions")
          .select("status,expires_at,max_count,reserved_count")
          .eq("token_hash", hash)
          .maybeSingle(),
      );
      if (!session || !validUploadSession(session))
        throw new CloudError(
          "This upload session has ended or expired. Ask the host for a new QR code.",
          410,
        );
      return noStore(session);
    }
    if (request.method === "POST") {
      // Cheap capability check before reading and decoding the body.
      const available = checked(
        await admin
          .from("upload_sessions")
          .select("status,expires_at,max_count,reserved_count")
          .eq("token_hash", hash)
          .maybeSingle(),
      );
      if (!available || !validUploadSession(available))
        throw new CloudError("This upload session has ended or expired.", 410);
      const { buffer, image } = await readImageForm(request);
      const reservation = await admin.rpc("reserve_upload", { p_hash: hash });
      if (reservation.error)
        throw new CloudError("This upload session is full or expired.", 410);
      const session = reservation.data;
      try {
        await storeAsset(admin, session.owner_id, buffer, image, {
          project_id: session.project_id,
          asset_type: "original",
          source_id: crypto.randomUUID(),
          upload_session_id: session.id,
        });
        return noStore({ uploaded: true });
      } catch (error) {
        await admin.rpc("release_upload", { p_id: session.id });
        throw error;
      }
    }
  }
  throw new CloudError("This link is unavailable.", 404);
}
