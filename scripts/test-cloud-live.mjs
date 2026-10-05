import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ),
  base = process.env.STRIPLY_TEST_ORIGIN || "http://127.0.0.1:3014",
  users = [];
const defaults = {
  format: "strip",
  mimeType: "image/png",
  resolution: "print",
  quality: 0.92,
  cutGuide: false,
};
async function account() {
  const email = `striply-test-${randomUUID()}@example.test`,
    password = randomBytes(24).toString("hex"),
    created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  assert(!created.error, "Fixture account could not be created");
  users.push(created.data.user.id);
  const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
    session = await client.auth.signInWithPassword({ email, password });
  assert(!session.error, "Fixture authentication failed");
  return {
    id: created.data.user.id,
    token: session.data.session.access_token,
    client,
  };
}
async function request(path, actor, method = "GET", body) {
  const headers = {};
  if (actor) headers.Authorization = `Bearer ${actor.token}`;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    value: response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : await response.arrayBuffer(),
    headers: response.headers,
  };
}
function document(id) {
  const now = new Date().toISOString();
  return {
    id,
    version: 2,
    createdAt: now,
    updatedAt: now,
    layoutId: "classic",
    templateId: "classic",
    photos: [null, null, null, null],
    layers: [],
    settings: {
      background: "#ffffff",
      foreground: "#292c27",
      spacing: 18,
      radius: 0,
      border: false,
      showFooter: true,
      title: "Live verification",
      date: "",
      footer: "",
    },
  };
}
async function upload(actor, projectId, type, buffer, mime = "image/png") {
  const form = new FormData();
  form.set("projectId", projectId);
  form.set("type", type);
  form.set("file", new Blob([buffer], { type: mime }), "verified.png");
  const result = await request("/api/cloud/assets", actor, "POST", form);
  assert.equal(result.status, 200, "Validated asset upload failed");
  return result.value;
}
try {
  const a = await account(),
    b = await account(),
    id = randomUUID(),
    project = document(id);
  let result = await request(`/api/cloud/projects/${id}`, a, "PUT", {
    document: project,
    name: "Live project",
    revision: 0,
    photo_assets: {},
    export_settings: defaults,
  });
  assert.equal(result.status, 200, "Cloud create failed");
  assert.equal(
    result.value.revision,
    1,
    "RPC must return a stable JSON object",
  );
  assert.equal(
    (await request(`/api/cloud/projects/${id}`, b)).status,
    404,
    "Another account could read a project",
  );
  const direct = await b.client.from("projects").select("id").eq("id", id);
  assert.equal(direct.data.length, 0, "Direct SDK bypassed RLS");
  const image = await sharp({
      create: { width: 600, height: 1800, channels: 3, background: "#659983" },
    })
      .png()
      .toBuffer(),
    asset = await upload(a, id, "export", image);
  assert.equal(
    (await request(`/api/cloud/assets/${asset.id}`, b)).status,
    404,
    "Another account could read a private image",
  );
  const signed = await request(`/api/cloud/assets/${asset.id}`, a);
  assert.equal(signed.status, 200);
  assert.equal(
    (await fetch(signed.value.url)).status,
    200,
    "Owner signed delivery failed",
  );
  const original = await upload(a, id, "original", image),
    sourceId = randomUUID();
  project.photos[0] = {
    id: sourceId,
    width: 600,
    height: 1800,
    transform: {
      zoom: 1.5,
      panX: 0.25,
      panY: 0,
      rotation: 90,
      flipX: true,
      flipY: false,
    },
    effects: {
      preset: "warm",
      brightness: 112,
      contrast: 100,
      saturation: 95,
      grayscale: 0,
      sepia: 0,
    },
  };
  const refs = { [sourceId]: { original: original.id } };
  result = await request(`/api/cloud/projects/${id}`, a, "PUT", {
    document: project,
    name: "Live project updated",
    revision: 1,
    photo_assets: refs,
    export_settings: defaults,
  });
  assert.equal(result.status, 200);
  assert.equal(result.value.revision, 2);
  assert.equal(
    (
      await request(`/api/cloud/projects/${id}`, a, "PUT", {
        document: project,
        name: "Stale",
        revision: 1,
        photo_assets: refs,
        export_settings: defaults,
      })
    ).status,
    409,
    "Stale update overwrote a project",
  );
  const roundtrip = await request(`/api/cloud/projects/${id}`, a);
  assert.deepEqual(
    roundtrip.value.document.photos[0],
    project.photos[0],
    "Cross-device metadata changed transformations",
  );
  assert.equal(roundtrip.value.photo_assets[sourceId].original, original.id);
  const share = await request("/api/cloud/shares", a, "POST", {
    projectId: id,
    assetId: asset.id,
    visibility: "link",
    days: 1,
  });
  assert.equal(share.status, 200, "Share creation failed");
  const token = new URL(share.value.url).pathname.split("/").pop();
  assert.equal((await request(`/api/public/shares/${token}`)).status, 200);
  const download = await request(
    `/api/public/shares/${token}/image?download=1`,
  );
  assert.equal(download.status, 200);
  assert(download.headers.get("cache-control").includes("no-store"));
  assert.equal(Buffer.from(download.value).readUInt32BE(16), 600);
  await admin
    .from("shares")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", share.value.id);
  assert.equal(
    (await request(`/api/public/shares/${token}`)).status,
    404,
    "Expired share remained accessible",
  );
  assert.equal(
    (await request(`/api/cloud/projects/${id}`, a)).status,
    200,
    "Share expiration deleted its owner project",
  );
  const privateShare = await request("/api/cloud/shares", a, "POST", {
    projectId: id,
    assetId: asset.id,
    visibility: "private",
    days: 0,
  });
  const privateToken = new URL(privateShare.value.url).pathname
    .split("/")
    .pop();
  assert.equal(
    (await request(`/api/public/shares/${privateToken}`)).status,
    404,
    "Private share was delivered publicly",
  );
  const event = await request("/api/cloud/events", a, "POST", {
    name: "Live event",
    template_id: "classic",
    layout_id: "classic",
    background: "#ffffff",
    foreground: "#292c27",
    gallery_visibility: "private",
  });
  assert.equal(event.status, 200);
  const galleryToken = new URL(event.value.gallery_url).pathname
    .split("/")
    .pop();
  assert.equal(
    (await request(`/api/public/galleries/${galleryToken}`)).status,
    404,
    "Private gallery was exposed",
  );
  const host = await request("/api/cloud/uploads", a, "POST", {
    projectId: id,
    count: 1,
  });
  assert.equal(host.status, 200);
  const phoneToken = new URL(host.value.url).pathname.split("/").pop();
  const form = new FormData();
  form.set("file", new Blob([image], { type: "image/png" }), "phone.png");
  assert.equal(
    (await request(`/api/public/uploads/${phoneToken}`, null, "POST", form))
      .status,
    200,
    "Phone upload failed",
  );
  assert.equal(
    (await request(`/api/public/uploads/${phoneToken}`)).status,
    410,
    "Full phone session remained active",
  );
  const arrived = await request(`/api/cloud/uploads/${host.value.id}`, a);
  assert.equal(
    arrived.value.assets.length,
    1,
    "Host did not receive phone image",
  );
  const second = await request("/api/cloud/uploads", a, "POST", {
    projectId: id,
    count: 4,
  });
  const secondToken = new URL(second.value.url).pathname.split("/").pop();
  await admin
    .from("upload_sessions")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("id", second.value.id);
  assert.equal(
    (await request(`/api/public/uploads/${secondToken}`)).status,
    410,
    "Expired phone upload was accepted",
  );
  const bad = new FormData();
  bad.set("projectId", id);
  bad.set("type", "original");
  bad.set(
    "file",
    new Blob(["<svg><script>bad</script></svg>"], { type: "image/png" }),
    "fake.png",
  );
  assert.equal(
    (await request("/api/cloud/assets", a, "POST", bad)).status,
    400,
    "Spoofed image MIME was trusted",
  );
  assert.equal(
    (await request(`/api/cloud/projects/${id}`, a, "DELETE")).status,
    200,
  );
  assert.equal((await request(`/api/cloud/assets/${asset.id}`, a)).status, 404);
  console.log(
    "Live Supabase verification passed: authentication, RLS, storage, revisions, shares/expiry/privacy, galleries, phone upload/expiry, validation and deletion.",
  );
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  const queue = await admin.from("storage_cleanup").select("id,object_path");
  if (queue.data?.length) {
    const removed = await admin.storage
      .from("striply-private")
      .remove(queue.data.map((row) => row.object_path));
    if (!removed.error)
      await admin
        .from("storage_cleanup")
        .delete()
        .in(
          "id",
          queue.data.map((row) => row.id),
        );
  }
}
