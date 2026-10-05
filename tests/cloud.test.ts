import { describe, it, expect } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import {
  newToken,
  tokenHash,
  uuid,
  validateImage,
  boundedBody,
} from "@/server/cloud/security";
import {
  activeShare,
  revisionMatches,
  shareExpiry,
  validUploadSession,
} from "@/features/cloud/types";
import { newProject, migrateProject } from "@/features/project/model";
import { serializeProject } from "@/features/project/persistence";
import type { ProjectStore } from "@/features/project/store";
describe("cloud security and delivery contracts", () => {
  it("uses independent 256-bit capability tokens and stores hashes", () => {
    const token = newToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(newToken()).not.toBe(token);
    expect(tokenHash(token)).not.toBe(token);
    expect(() => tokenHash("project123")).toThrow();
  });
  it("checks visibility, revocation and exact expiration before public delivery", () => {
    const now = 100000;
    expect(
      activeShare(
        { visibility: "link", status: "active", expires_at: null },
        now,
      ),
    ).toBe(true);
    expect(
      activeShare(
        { visibility: "private", status: "active", expires_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      activeShare(
        { visibility: "link", status: "revoked", expires_at: null },
        now,
      ),
    ).toBe(false);
    expect(
      activeShare(
        {
          visibility: "link",
          status: "active",
          expires_at: new Date(now).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });
  it("supports only the explicit expiry choices", () => {
    expect(shareExpiry(0)).toBeNull();
    expect(shareExpiry(7, 0)).toBe(new Date(7 * 86400000).toISOString());
    expect(() => shareExpiry(-1)).toThrow();
  });
  it("closed, full and expired phone sessions are rejected", () => {
    const s = {
      status: "active",
      expires_at: new Date(2000).toISOString(),
      max_count: 4,
      reserved_count: 0,
    };
    expect(validUploadSession(s, 1000)).toBe(true);
    expect(validUploadSession({ ...s, status: "closed" }, 1000)).toBe(false);
    expect(validUploadSession({ ...s, reserved_count: 4 }, 1000)).toBe(false);
    expect(validUploadSession(s, 2000)).toBe(false);
  });
  it("never treats a stale project revision as current", () => {
    expect(revisionMatches(1, 2)).toBe(false);
    expect(revisionMatches(2, 2)).toBe(true);
  });
  it("validates decoded image content rather than trusting MIME", async () => {
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    expect(await validateImage(image, "image/png")).toEqual({
      mime: "image/png",
      width: 20,
      height: 10,
    });
    await expect(validateImage(image, "image/jpeg")).rejects.toThrow();
    await expect(
      validateImage(
        Buffer.from("<svg><script>alert(1)</script></svg>"),
        "image/png",
      ),
    ).rejects.toThrow();
    await expect(
      validateImage(image.subarray(0, 30), "image/png"),
    ).rejects.toThrow();
  });
  it("bounds streamed request bodies even without a content-length", async () => {
    await expect(
      boundedBody(
        new Request("http://localhost", { method: "POST", body: "123456" }),
        5,
      ),
    ).rejects.toThrow(/large/);
  });
  it("QR payload is a share URL, not photo bytes", async () => {
    const url = `https://striply.example/s/${newToken()}`,
      qr = QRCode.create(url);
    expect(qr.modules.size).toBeGreaterThan(20);
    expect(
      qr.segments.map((s) => ("data" in s ? s.data : "")).length,
    ).toBeGreaterThan(0);
  });
  it("rejects malformed resource identifiers", () => {
    expect(() => uuid("../../private")).toThrow();
    expect(uuid("10000000-0000-4000-8000-000000000001")).toBeTruthy();
  });
  it("legacy local projects stay compatible and optional event context is validated", () => {
    const project = newProject();
    expect(migrateProject(project).version).toBe(2);
    project.event = {
      id: "40000000-0000-4000-8000-000000000001",
      allowCustomization: false,
    };
    expect(migrateProject(project).event?.allowCustomization).toBe(false);
    expect(() =>
      migrateProject({
        ...project,
        event: { ...project.event, id: "../event" },
      }),
    ).toThrow();
  });
  it("temporary cloud previews cannot replace persisted originals", () => {
    const project = newProject();
    project.photos[0] = {
      id: "source",
      width: 800,
      height: 600,
      transform: { zoom: 1, panX: 0, panY: 0 },
      effects: {
        preset: "original",
        brightness: 100,
        contrast: 100,
        saturation: 100,
      },
    };
    const store = {
      getSnapshot: () => ({ present: project }),
      resources: new Map([
        [
          "source",
          {
            cloudPreview: true,
            file: new File(["preview"], "preview.png", { type: "image/png" }),
          },
        ],
      ]),
    } as unknown as ProjectStore;
    expect(() => serializeProject(store)).toThrow(
      /originals are still loading/,
    );
  });
});
