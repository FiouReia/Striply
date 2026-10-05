import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  authenticatedClient,
  checked,
  cleanupStorage,
  noStore,
  owned,
  rateLimit,
} from "./clients";
import {
  readImageForm,
  readJson,
  shortText,
  uuid,
  newToken,
  tokenHash,
} from "./security";
import { CloudError, shareExpiry } from "@/features/cloud/types";
import { migrateProject } from "@/features/project/model";
import { templates } from "@/features/templates/templates";
import { layouts } from "@/features/collage/layout";
function origin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
  ).replace(/\/$/, "");
}
export async function storeAsset(
  db: SupabaseClient,
  owner: string,
  buffer: Buffer,
  image: { mime: string; width: number; height: number },
  values: {
    project_id?: string;
    event_id?: string;
    source_id?: string;
    asset_type: string;
    upload_session_id?: string;
  },
) {
  const id = crypto.randomUUID(),
    extension =
      image.mime === "image/jpeg"
        ? "jpg"
        : image.mime === "image/png"
          ? "png"
          : "webp";
  const object_path = `users/${owner}/${values.project_id ? `projects/${values.project_id}` : `events/${values.event_id}`}/${values.asset_type}/${id}.${extension}`;
  const admin = adminClient();
  checked(
    await admin.storage
      .from("striply-private")
      .upload(object_path, buffer, { contentType: image.mime, upsert: false }),
  );
  try {
    return checked(
      await admin
        .from("project_assets")
        .insert({
          id,
          owner_id: owner,
          ...values,
          object_path,
          mime_type: image.mime,
          width: image.width,
          height: image.height,
          bytes: buffer.length,
        })
        .select()
        .single(),
    );
  } catch (error) {
    await admin.from("storage_cleanup").insert({ object_path });
    await cleanupStorage(admin);
    throw error;
  }
}
export async function privateRequest(request: Request, path: string[]) {
  const { db, owner } = await authenticatedClient(request),
    method = request.method,
    resource = path[0],
    id = path[1];
  if (method !== "GET") await rateLimit(request, `owner:${owner}`, 80);
  if (resource === "profile") {
    if (method === "GET")
      return noStore(
        checked(
          await db.from("profiles").select("*").eq("id", owner).maybeSingle(),
        ),
      );
    if (method === "PUT") {
      const body = await readJson(request);
      return noStore(
        checked(
          await db
            .from("profiles")
            .upsert({
              id: owner,
              display_name: shortText(body.display_name),
              username: body.username ? shortText(body.username, 30) : null,
              avatar_url:
                body.avatar_url && /^https:\/\//.test(body.avatar_url)
                  ? body.avatar_url.slice(0, 2048)
                  : null,
            })
            .select()
            .single(),
        ),
      );
    }
  }
  if (resource === "projects") {
    if (method === "GET")
      return noStore(
        id
          ? await owned(db, "projects", uuid(id))
          : checked(
              await db
                .from("projects")
                .select(
                  "id,owner_id,name,document,photo_assets,export_settings,revision,updated_at,thumbnail_asset_id",
                )
                .order("updated_at", { ascending: false })
                .limit(100),
            ),
      );
    if (method === "PUT" && id) {
      const body = await readJson(request),
        document = migrateProject(body.document);
      if (document.id !== uuid(id))
        throw new CloudError("Project ID does not match.", 400);
      if (!Number.isInteger(body.revision) || body.revision < 0)
        throw new CloudError("Invalid revision.", 400);
      const photos = body.photo_assets ?? {},
        ids: string[] = [];
      if (document.event) await owned(db, "events", uuid(document.event.id));
      for (const photo of [...document.photos, document.event?.logoPhoto])
        if (photo) {
          const refs = photos[photo.id];
          if (!refs) {
            if (body.revision !== 0)
              throw new CloudError("Upload each original before saving.", 400);
            continue;
          }
          ids.push(uuid(refs.original));
          if (refs.preview) ids.push(uuid(refs.preview));
        }
      if (body.thumbnail_asset_id) ids.push(uuid(body.thumbnail_asset_id));
      if (ids.length) {
        const assets = checked(
          await db
            .from("project_assets")
            .select("id,project_id,asset_type")
            .in("id", ids),
        );
        if (
          assets.length !== new Set(ids).size ||
          assets.some((asset) => asset.project_id !== id)
        )
          throw new CloudError("A photo reference is unavailable.", 400);
        for (const photo of [...document.photos, document.event?.logoPhoto]) {
          if (!photo) continue;
          const ref = photos[photo.id];
          if (!ref) continue;
          if (
            assets.find((a) => a.id === ref.original)?.asset_type !==
              "original" ||
            (ref.preview &&
              assets.find((a) => a.id === ref.preview)?.asset_type !==
                "preview")
          )
            throw new CloudError(
              "Use original photos and separate previews when saving.",
              400,
            );
        }
        if (
          body.thumbnail_asset_id &&
          assets.find((a) => a.id === body.thumbnail_asset_id)?.asset_type !==
            "preview"
        )
          throw new CloudError("Invalid project thumbnail.", 400);
      }
      const ex = body.export_settings ?? {};
      if (
        !["strip", "sheet"].includes(ex.format) ||
        !["image/png", "image/jpeg"].includes(ex.mimeType) ||
        !["digital", "high", "print"].includes(ex.resolution) ||
        typeof ex.quality !== "number" ||
        ex.quality < 0.7 ||
        ex.quality > 0.98 ||
        typeof ex.cutGuide !== "boolean"
      )
        throw new CloudError("Invalid export settings.", 400);
      const saved = checked(
        await db.rpc("save_project", {
          p_id: id,
          p_name: shortText(body.name),
          p_document: document,
          p_photos: photos,
          p_export: ex,
          p_revision: body.revision,
          p_thumbnail: body.thumbnail_asset_id ?? null,
        }),
      );
      if (
        document.event &&
        document.photos.every(Boolean) &&
        Object.keys(photos).length >= document.photos.filter(Boolean).length
      ) {
        const existing = checked(
          await db
            .from("booth_sessions")
            .select("id")
            .eq("project_id", id)
            .maybeSingle(),
        );
        if (!existing)
          checked(
            await adminClient()
              .from("booth_sessions")
              .insert({
                owner_id: owner,
                event_id: document.event.id,
                project_id: id,
              }),
          );
      }
      return noStore(saved);
    }
    if (method === "PATCH" && id) {
      const project = await owned(db, "projects", uuid(id)),
        body = await readJson(request);
      return noStore(
        checked(
          await db.rpc("save_project", {
            p_id: id,
            p_name: shortText(body.name),
            p_document: project.document,
            p_photos: project.photo_assets,
            p_export: project.export_settings,
            p_revision: body.revision,
            p_thumbnail: project.thumbnail_asset_id,
          }),
        ),
      );
    }
    if (method === "DELETE" && id) {
      await owned(db, "projects", uuid(id));
      checked(
        await adminClient()
          .from("projects")
          .delete()
          .eq("id", id)
          .eq("owner_id", owner),
      );
      await cleanupStorage();
      return noStore({ deleted: true });
    }
  }
  if (resource === "assets") {
    if (method === "GET" && id) {
      const asset = await owned(db, "project_assets", uuid(id));
      const signed = checked(
        await db.storage
          .from("striply-private")
          .createSignedUrl(asset.object_path, 60),
      );
      return noStore({ url: signed.signedUrl });
    }
    if (method === "POST") {
      const { form, buffer, image } = await readImageForm(request),
        project = form.get("projectId"),
        event = form.get("eventId"),
        type = String(form.get("type"));
      if (!["original", "preview", "export", "logo"].includes(type))
        throw new CloudError("Invalid image purpose.", 400);
      if (project) await owned(db, "projects", uuid(project));
      else if (event && type === "logo") await owned(db, "events", uuid(event));
      else throw new CloudError("Choose a project or event.", 400);
      const asset = await storeAsset(db, owner, buffer, image, {
        ...(project
          ? { project_id: uuid(project) }
          : { event_id: uuid(event) }),
        asset_type: type,
        source_id: form.get("sourceId")
          ? String(form.get("sourceId")).slice(0, 100)
          : undefined,
      });
      await cleanupStorage();
      return noStore(asset);
    }
  }
  if (resource === "shares") {
    if (method === "GET")
      return noStore(
        checked(
          await db
            .from("shares")
            .select("id,project_id,expires_at,visibility,status,created_at")
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      );
    if (method === "POST") {
      const body = await readJson(request),
        project = await owned(db, "projects", uuid(body.projectId)),
        asset = await owned(db, "project_assets", uuid(body.assetId));
      if (asset.project_id !== project.id || asset.asset_type !== "export")
        throw new CloudError("Only a finished export can be shared.", 400);
      if (body.previewAssetId) {
        const preview = await owned(
          db,
          "project_assets",
          uuid(body.previewAssetId),
        );
        if (
          preview.project_id !== project.id ||
          preview.asset_type !== "preview"
        )
          throw new CloudError("Invalid share preview.", 400);
      }
      let session = null;
      if (body.eventId) {
        await owned(db, "events", uuid(body.eventId));
        session = checked(
          await db
            .from("booth_sessions")
            .select("id,event_id")
            .eq("project_id", project.id)
            .maybeSingle(),
        );
        if (!session || session.event_id !== body.eventId)
          throw new CloudError("This project is not part of that event.", 400);
      }
      const token = newToken(),
        visibility = body.visibility === "private" ? "private" : "link";
      const share = checked(
        await adminClient()
          .from("shares")
          .insert({
            owner_id: owner,
            project_id: project.id,
            asset_id: asset.id,
            preview_asset_id: body.previewAssetId ?? null,
            event_id: body.eventId ?? null,
            session_id: session?.id ?? null,
            token_hash: tokenHash(token),
            visibility,
            expires_at: shareExpiry(Number(body.days)),
          })
          .select("id,expires_at,visibility")
          .single(),
      );
      return noStore({ ...share, url: `${origin(request)}/s/${token}` });
    }
    if (method === "DELETE" && id) {
      await owned(db, "shares", uuid(id));
      checked(
        await adminClient()
          .from("shares")
          .update({ status: "revoked" })
          .eq("id", id)
          .eq("owner_id", owner),
      );
      return noStore({ revoked: true });
    }
  }
  if (resource === "events") {
    if (method === "GET") {
      if (id) {
        const event = await owned(db, "events", uuid(id));
        return noStore({
          ...event,
          gallery_url:
            event.gallery_visibility !== "private"
              ? `${origin(request)}/e/${event.gallery_token}`
              : null,
        });
      }
      const events = checked(
        await db
          .from("events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      );
      const sessions = checked(
        await db.from("booth_sessions").select("event_id"),
      );
      return noStore(
        events.map((event) => ({
          ...event,
          gallery_url:
            event.gallery_visibility !== "private"
              ? `${origin(request)}/e/${event.gallery_token}`
              : null,
          session_count: sessions.filter((s) => s.event_id === event.id).length,
        })),
      );
    }
    if (method === "POST" || method === "PUT") {
      const body = await readJson(request);
      const previous = id ? await owned(db, "events", uuid(id)) : null;
      if (
        !templates.some((t) => t.id === body.template_id) ||
        !layouts.some((l) => l.id === body.layout_id) ||
        !/^#[a-f0-9]{6}$/i.test(body.background) ||
        !/^#[a-f0-9]{6}$/i.test(body.foreground) ||
        !["private", "link", "public"].includes(body.gallery_visibility)
      )
        throw new CloudError("Invalid event settings.", 400);
      if (body.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.event_date))
        throw new CloudError("Choose a valid date.", 400);
      if (body.logo_asset_id) {
        const logo = await owned(
          db,
          "project_assets",
          uuid(body.logo_asset_id),
        );
        if (logo.event_id !== id || logo.asset_type !== "logo")
          throw new CloudError("Invalid event logo.", 400);
      }
      const token = previous?.gallery_token ?? newToken(),
        value = {
          owner_id: owner,
          name: shortText(body.name),
          event_date: body.event_date || null,
          template_id: body.template_id,
          layout_id: body.layout_id,
          background: body.background,
          foreground: body.foreground,
          allow_customization: body.allow_customization !== false,
          gallery_visibility: body.gallery_visibility,
          gallery_token_hash: tokenHash(token),
          gallery_token: token,
          share_visibility:
            body.share_visibility === "link" ? "link" : "private",
          share_days: [0, 1, 7, 30].includes(body.share_days)
            ? body.share_days
            : 7,
          auto_delivery: body.auto_delivery === true,
          logo_asset_id: body.logo_asset_id ?? null,
        };
      const result = checked(
        await adminClient()
          .from("events")
          .upsert({ id: id ? uuid(id) : crypto.randomUUID(), ...value })
          .select()
          .single(),
      );
      return noStore({
        ...result,
        gallery_url: `${origin(request)}/e/${token}`,
      });
    }
    if (method === "DELETE" && id) {
      await owned(db, "events", uuid(id));
      checked(
        await adminClient()
          .from("events")
          .delete()
          .eq("id", id)
          .eq("owner_id", owner),
      );
      await cleanupStorage();
      return noStore({ deleted: true });
    }
  }
  if (resource === "sessions" && method === "POST") {
    const body = await readJson(request);
    await owned(db, "events", uuid(body.eventId));
    await owned(db, "projects", uuid(body.projectId));
    const existing = checked(
      await db
        .from("booth_sessions")
        .select("*")
        .eq("project_id", body.projectId)
        .maybeSingle(),
    );
    if (existing) {
      if (existing.event_id !== body.eventId)
        throw new CloudError("Session belongs to another event.", 400);
      return noStore(existing);
    }
    return noStore(
      checked(
        await adminClient()
          .from("booth_sessions")
          .insert({
            owner_id: owner,
            event_id: body.eventId,
            project_id: body.projectId,
          })
          .select()
          .single(),
      ),
    );
  }
  if (resource === "uploads") {
    if (method === "POST") {
      const body = await readJson(request);
      await owned(db, "projects", uuid(body.projectId));
      const token = newToken();
      const session = checked(
        await adminClient()
          .from("upload_sessions")
          .insert({
            owner_id: owner,
            project_id: body.projectId,
            token_hash: tokenHash(token),
            max_count: Math.max(1, Math.min(4, Number(body.count) || 4)),
          })
          .select("id,status,expires_at,max_count,reserved_count")
          .single(),
      );
      return noStore({ ...session, url: `${origin(request)}/upload/${token}` });
    }
    if (method === "GET" && id) {
      const session = await owned(db, "upload_sessions", uuid(id));
      const assets = checked(
        await db
          .from("project_assets")
          .select("*")
          .eq("upload_session_id", id)
          .order("uploaded_at"),
      );
      return noStore({ session, assets });
    }
    if (method === "DELETE" && id) {
      await owned(db, "upload_sessions", uuid(id));
      checked(
        await adminClient()
          .from("upload_sessions")
          .update({ status: "closed", ended_by_host: true })
          .eq("id", id)
          .eq("owner_id", owner),
      );
      return noStore({ closed: true });
    }
  }
  throw new CloudError("This action is unavailable.", 404);
}
