import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type {
  CloudProject,
  Asset,
  EventRecord,
} from "../src/features/cloud/types";
const owner = "10000000-0000-4000-8000-000000000001",
  token = "a".repeat(64);
async function setup(context: BrowserContext) {
  const user = {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "host@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const payload = Buffer.from(
    JSON.stringify({
      sub: owner,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: "authenticated",
      aud: "authenticated",
    }),
  ).toString("base64url");
  await context.addInitScript(
    (session) =>
      localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
    {
      access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`,
      refresh_token: "fake-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user,
    },
  );
  await context.route("http://127.0.0.1:54321/**", (route) =>
    route.fulfill({ json: user }),
  );
  const projects = new Map<string, CloudProject>(),
    assets = new Map<string, { asset: Asset; bytes: Buffer }>(),
    events = new Map<string, EventRecord>(),
    shares = new Map<
      string,
      {
        asset: string;
        event?: string;
        expires_at: string | null;
        visibility: string;
      }
    >();
  let upload: {
    id: string;
    projectId: string;
    count: number;
    max: number;
    closed: boolean;
  } | null = null;
  await context.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, json: value });
    if (path.startsWith("/api/fixture/")) {
      const item = assets.get(path.split("/").pop()!);
      return item
        ? route.fulfill({ body: item.bytes, contentType: item.asset.mime_type })
        : json({ error: "missing" }, 404);
    }
    if (path.startsWith("/api/cloud/")) {
      const [resource, id] = path.slice("/api/cloud/".length).split("/");
      if (resource === "profile") return json({ display_name: "Host" });
      if (resource === "projects") {
        if (method === "GET")
          return id
            ? projects.has(id)
              ? json(projects.get(id))
              : json({ error: "missing" }, 404)
            : json([...projects.values()]);
        if (method === "PUT") {
          const body = request.postDataJSON(),
            old = projects.get(id);
          if (old && old.revision !== body.revision)
            return json(
              { error: "This project changed on another device." },
              409,
            );
          const row = {
            id,
            owner_id: owner,
            name: body.name,
            document: body.document,
            photo_assets: body.photo_assets,
            export_settings: body.export_settings,
            revision: (old?.revision ?? 0) + 1,
            updated_at: new Date().toISOString(),
            thumbnail_asset_id: body.thumbnail_asset_id,
          };
          projects.set(id, row);
          return json(row);
        }
        if (method === "DELETE") {
          projects.delete(id);
          return json({ deleted: true });
        }
      }
      if (resource === "assets") {
        if (method === "GET")
          return json({ url: `${url.origin}/api/fixture/${id}` });
        const data = await new Response(
            new Uint8Array(request.postDataBuffer()!),
            { headers: { "content-type": request.headers()["content-type"] } },
          ).formData(),
          file = data.get("file") as File;
        const asset: Asset = {
          id: crypto.randomUUID(),
          project_id: String(data.get("projectId")),
          source_id: data.get("sourceId") ? String(data.get("sourceId")) : null,
          asset_type: String(data.get("type")) as Asset["asset_type"],
          object_path: "private",
          mime_type: file.type,
          bytes: file.size,
          width: 800,
          height: 600,
        };
        assets.set(asset.id, {
          asset,
          bytes: Buffer.from(await file.arrayBuffer()),
        });
        return json(asset);
      }
      if (resource === "shares") {
        if (method === "GET") return json([]);
        if (method === "POST") {
          const body = request.postDataJSON();
          shares.set(token, {
            asset: body.assetId,
            event: body.eventId,
            expires_at: body.days
              ? new Date(Date.now() + body.days * 86400000).toISOString()
              : null,
            visibility: body.visibility,
          });
          return json({
            id: crypto.randomUUID(),
            url: `${url.origin}/s/${token}`,
            expires_at: shares.get(token)!.expires_at,
            visibility: body.visibility,
          });
        }
        return json({ revoked: true });
      }
      if (resource === "events") {
        if (method === "GET")
          return id ? json(events.get(id)) : json([...events.values()]);
        const body = request.postDataJSON(),
          row = { ...body, id: id || crypto.randomUUID(), session_count: 0 };
        events.set(row.id, row);
        return json({ ...row, gallery_url: `${url.origin}/e/${token}` });
      }
      if (resource === "sessions")
        return json({ id: crypto.randomUUID(), ...request.postDataJSON() });
      if (resource === "uploads") {
        if (method === "POST") {
          const body = request.postDataJSON();
          upload = {
            id: crypto.randomUUID(),
            projectId: body.projectId,
            count: 0,
            max: body.count,
            closed: false,
          };
          return json({
            id: upload.id,
            url: `${url.origin}/upload/${token}`,
            expires_at: new Date(Date.now() + 900000).toISOString(),
            max_count: upload.max,
            reserved_count: 0,
            status: "active",
          });
        }
        if (method === "DELETE") {
          if (upload) upload.closed = true;
          return json({ closed: true });
        }
        return json({
          session: {
            status: upload?.closed ? "closed" : "active",
            expires_at: new Date(Date.now() + 900000).toISOString(),
            reserved_count: upload?.count,
          },
          assets: [...assets.values()]
            .map((a) => a.asset)
            .filter((a) => a.upload_session_id === upload?.id),
        });
      }
    }
    if (path.startsWith(`/api/public/shares/${token}`)) {
      const share = shares.get(token);
      if (
        !share ||
        share.visibility !== "link" ||
        (share.expires_at && Date.parse(share.expires_at) <= Date.now())
      )
        return json({ error: "This link is private or expired." }, 404);
      if (path.endsWith("/image")) {
        const item = assets.get(share.asset)!;
        return route.fulfill({
          body: item.bytes,
          contentType: item.asset.mime_type,
          headers: {
            "Content-Disposition": url.searchParams.has("download")
              ? 'attachment; filename="striply.png"'
              : "inline",
          },
        });
      }
      return json({
        image: `/api/public/shares/${token}/image`,
        expires_at: share.expires_at,
        event: share.event ? { name: events.get(share.event)?.name } : null,
      });
    }
    if (path.startsWith(`/api/public/uploads/${token}`)) {
      if (!upload || upload.closed)
        return json(
          { error: "This upload session has ended or expired." },
          410,
        );
      if (method === "GET")
        return json({
          expires_at: new Date(Date.now() + 900000).toISOString(),
          max_count: upload.max,
          reserved_count: upload.count,
        });
      const data = await new Response(
          new Uint8Array(request.postDataBuffer()!),
          { headers: { "content-type": request.headers()["content-type"] } },
        ).formData(),
        file = data.get("file") as File;
      const asset: Asset = {
        id: crypto.randomUUID(),
        project_id: upload.projectId,
        source_id: crypto.randomUUID(),
        asset_type: "original",
        object_path: "private",
        mime_type: file.type,
        bytes: file.size,
        width: 800,
        height: 600,
        upload_session_id: upload.id,
      };
      assets.set(asset.id, {
        asset,
        bytes: Buffer.from(await file.arrayBuffer()),
      });
      upload.count++;
      if (upload.count >= upload.max) upload.closed = true;
      return json({ uploaded: true });
    }
    if (path.startsWith(`/api/public/galleries/${token}`)) {
      const event = [...events.values()][0];
      if (!event || event.gallery_visibility === "private")
        return json({ error: "This gallery is private." }, 404);
      return json({
        event: { name: event.name },
        items: [...shares]
          .filter(
            ([, share]) =>
              share.visibility === "link" &&
              (!share.expires_at || Date.parse(share.expires_at) > Date.now()),
          )
          .map(([slug]) => ({
            id: slug,
            image: `/api/public/shares/${slug}/image`,
          })),
      });
    }
    return json({ error: "unavailable" }, 404);
  });
  return { projects, assets, events, shares };
}
async function image(page: Page) {
  return Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 800;
      c.height = 600;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#6d9d83";
      ctx.fillRect(0, 0, 800, 600);
      const b = await new Promise<Blob>((r) => c.toBlob((b) => r(b!)));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    }),
  );
}
async function create(page: Page) {
  await page.goto("/");
  const bytes = await image(page);
  await page
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles(
      Array.from({ length: 4 }, (_, i) => ({
        name: `photo-${i}.png`,
        mimeType: "image/png",
        buffer: bytes,
      })),
    );
  await page.getByText("Save & share", { exact: true }).click();
  await page
    .getByRole("button", { name: "Save to Cloud", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Cloud sync status" }),
  ).toHaveText("Saved to cloud");
  return bytes;
}
test("cloud save, reopen, edit, offline sync and conflict copy", async ({
  page,
  context,
}) => {
  const data = await setup(context);
  await create(page);
  await expect.poll(() => data.projects.size).toBe(1);
  const id = [...data.projects.keys()][0];
  await context.setOffline(true);
  await page
    .getByRole("navigation", { name: "Editor steps" })
    .getByRole("button", { name: /Customize/ })
    .click();
  await page.getByLabel("Strip title").fill("Edited offline");
  await expect(
    page.getByRole("status", { name: "Cloud sync status" }),
  ).toContainText("Offline");
  await page.waitForTimeout(2200);
  await context.setOffline(false);
  await expect
    .poll(() => data.projects.get(id)?.document.settings.title)
    .toBe("Edited offline");
  await page.goto(`/account`);
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByText("Save & share", { exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Cloud sync status" }),
  ).toHaveText("Saved to cloud");
  await expect(
    page.getByRole("button", { name: /Download PNG/ }),
  ).toBeEnabled();
  data.projects.get(id)!.revision++;
  await page
    .getByRole("button", { name: "Save to Cloud", exact: true })
    .click();
  await expect(
    page.getByText("Conflict - local version kept", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Keep Local — Save as Copy", exact: true })
    .click();
  await expect.poll(() => data.projects.size).toBe(2);
  await expect(
    page.getByRole("status", { name: "Cloud sync status" }),
  ).toHaveText("Saved to cloud");
});
test("QR share opens a guest download page and private/expired links fail", async ({
  page,
  context,
}) => {
  const data = await setup(context);
  await create(page);
  await page
    .getByRole("button", { name: "Create Share Link / QR", exact: true })
    .click();
  await expect(page.getByAltText("QR code: Scan to download")).toBeVisible();
  const guest = await context.newPage();
  await guest.goto(`/s/${token}`);
  await expect(guest.getByAltText("Your finished photo strip")).toBeVisible();
  const downloading = guest.waitForEvent("download");
  await guest.getByRole("link", { name: "Download / Save Image" }).click();
  await downloading;
  data.shares.get(token)!.expires_at = new Date(
    Date.now() - 1000,
  ).toISOString();
  await guest.reload();
  await expect(guest.locator("main p[role=alert]")).toContainText("expired");
});
test("phone photos reach the host and a closed session rejects further uploads", async ({
  page,
  context,
}) => {
  await setup(context);
  await page.goto("/");
  const bytes = await image(page);
  await page.getByText("Save & share", { exact: true }).click();
  await page
    .getByRole("button", { name: "Add Photos from Phone", exact: true })
    .click();
  await expect(page.getByAltText("QR code: Scan to send photos")).toBeVisible();
  const phone = await context.newPage();
  await phone.goto(`/upload/${token}`);
  await phone
    .getByLabel("Choose phone photos", { exact: true })
    .setInputFiles(
      Array.from({ length: 4 }, (_, i) => ({
        name: `phone-${i}.png`,
        mimeType: "image/png",
        buffer: bytes,
      })),
    );
  await expect(phone.getByText(/This session is complete/)).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole("button", { name: /Download PNG/ })).toBeEnabled({
    timeout: 20000,
  });
  await phone.reload();
  await expect(phone.locator("main p[role=alert]")).toContainText(
    "ended or expired",
  );
});
test("event presets, mocked booth captures, QR and optional gallery", async ({
  page,
  context,
}) => {
  const data = await setup(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        c.getContext("2d")!.fillRect(0, 0, 640, 480);
        return c.captureStream(10);
      },
    });
  });
  await page.goto("/events");
  await page.getByLabel("Event name", { exact: true }).fill("Our wedding");
  await page
    .getByLabel("Default theme", { exact: true })
    .selectOption("wedding");
  await page.getByLabel("Guest gallery", { exact: true }).selectOption("link");
  await page
    .getByLabel("Event strip sharing", { exact: true })
    .selectOption("link");
  await page
    .getByLabel("Automatically create a download QR after captures", {
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Create Event", exact: true }).click();
  await expect.poll(() => data.events.size).toBe(1);
  await page
    .getByRole("link", { name: "Start Booth Session", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByText("Session timing", { exact: true }).click();
  await page.getByLabel("Countdown seconds", { exact: true }).fill("1");
  await page.getByLabel("Pause between shots", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Start Session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to editor", exact: true })
    .click();
  await expect(page.getByAltText("QR code: Scan to download")).toBeVisible();
  const gallery = await context.newPage();
  await gallery.goto(`/e/${token}`);
  await expect(
    gallery.getByRole("heading", { name: "Our wedding" }),
  ).toBeVisible();
  await expect(gallery.getByAltText("Finished event photo strip")).toHaveCount(
    1,
  );
});

test("guest authentication guards and magic link request preserve local creation", async ({
  page,
  context,
}) => {
  await context.route("http://127.0.0.1:54321/**", (route) =>
    route.fulfill({
      json: {},
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    }),
  );
  await page.goto("/account");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  const bytes = await image(page);
  await page
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles(
      Array.from({ length: 4 }, (_, i) => ({
        name: `guest-${i}.png`,
        mimeType: "image/png",
        buffer: bytes,
      })),
    );
  await page.getByText("Save & share", { exact: true }).click();
  await page
    .getByRole("button", { name: "Save to Cloud", exact: true })
    .click();
  await expect(page).toHaveURL(/sign-in/, { timeout: 20000 });
  await page.getByLabel("Email address").fill("host@example.com");
  await page
    .getByRole("button", { name: "Email me a sign-in link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto("/");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Download PNG/ }),
  ).toBeEnabled();
});
test("named local projects open without cloud or accounts", async ({
  page,
}) => {
  await page.goto("/");
  const bytes = await image(page);
  await page
    .getByLabel("Choose photos", { exact: true })
    .setInputFiles(
      Array.from({ length: 4 }, (_, i) => ({
        name: `local-${i}.png`,
        mimeType: "image/png",
        buffer: bytes,
      })),
    );
  await page.getByText("Save & share", { exact: true }).click();
  await page
    .getByRole("button", { name: "Save on Device", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Editor status" }),
  ).toContainText("Local Projects");
  await page.goto("/local-projects");
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Autosave status" }),
  ).not.toContainText("Checking");
  if (
    await page.getByRole("button", { name: "Restore", exact: true }).isVisible()
  )
    await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Download PNG/ }),
  ).toBeEnabled();
});
