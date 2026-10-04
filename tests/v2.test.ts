import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectStore } from "../src/features/project/store";
import type { Photo } from "../src/features/photos/types";
import { defaultEffects } from "../src/features/photos/effects";
import { newProject, migrateProject } from "../src/features/project/model";
import { commitHistory, undoHistory, redoHistory, HISTORY_LIMIT, type HistoryState } from "../src/features/project/history";
import { calculateCrop, calculateLayout, exportDimensions, layouts, orientedDimensions } from "../src/features/collage/layout";
import { outputDimensions } from "../src/features/export/export";
import { templates } from "../src/features/templates/templates";
import { defaultTransform } from "../src/features/photos/types";
import { createSaveQueue, type SavedProject, type ProjectRepository } from "../src/features/project/persistence";
import { defaultBoothConfiguration, runBoothSession } from "../src/features/camera/session";
import { cameraError, stopCamera } from "../src/features/camera/service";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("versioned projects and layers", () => {
 it("round-trips plain layer data without runtime image resources", () => {
  const project = newProject(); project.layers.push({ id: "text", type: "text", x: 40, y: 50, width: 400, height: 80, rotation: 15, visible: true, text: "Our day", font: "serif", fontSize: 32, weight: "bold", align: "center", color: "#121212" });
  project.layers.push({ id: "sticker", type: "sticker", stickerId: "heart", x: 100, y: 200, width: 80, height: 80, rotation: -20, visible: true });
  expect(migrateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
 });
 it("explicitly migrates V1 metadata and preserves styles", () => { const old = { ...newProject(), version: 1, layoutId: undefined, layers: undefined }; const migrated = migrateProject(old); expect(migrated.version).toBe(2); expect(migrated.layoutId).toBe("classic"); expect(migrated.settings).toEqual(old.settings); expect(old.version).toBe(1); });
 it("rejects future schemas and invalid layers without mutating input", () => { const future = { ...newProject(), version: 99 }; expect(() => migrateProject(future)).toThrow(/unsupported version/); expect(future.version).toBe(99); const invalid = newProject(); invalid.layers = [{ id: "evil", type: "sticker", stickerId: "https://evil.test/a.svg", x: 0, y: 0, width: 80, height: 80, rotation: 0, visible: true }]; expect(() => migrateProject(invalid)).toThrow(/sticker/); });
});
describe("history", () => {
 const initial = (): HistoryState => ({ present: newProject(), past: [], future: [], group: null });
 it("coalesces continuous gestures and supports undo/redo", () => { let state = initial(); const before = state.present; for (let i = 0; i < 10; i++) state = commitHistory(state, { ...state.present, settings: { ...state.present.settings, spacing: 20 + i } }, "drag"); expect(state.past).toHaveLength(1); const after = state.present; state = undoHistory(state); expect(state.present).toEqual(before); expect(redoHistory(state).present).toEqual(after); });
 it("invalidates redo on new edits and bounds retained snapshots", () => { let state = initial(); for (let i = 0; i < 100; i++) state = commitHistory(state, { ...state.present, settings: { ...state.present.settings, title: String(i) } }); expect(state.past).toHaveLength(HISTORY_LIMIT); state = undoHistory(state); state = commitHistory(state, { ...state.present, settings: { ...state.present.settings, title: "new" } }); expect(state.future).toHaveLength(0); });
});
describe("oriented geometry and exports", () => {
 it.each(layouts)("keeps all $name frames in bounds", definition => { const layout = calculateLayout(templates[0].settings, definition.id); expect(layout.frames).toHaveLength(definition.photoCount); layout.frames.forEach(frame => { expect(frame.x).toBeGreaterThanOrEqual(0); expect(frame.y).toBeGreaterThanOrEqual(0); expect(frame.x + frame.width).toBeLessThanOrEqual(layout.width); expect(frame.y + frame.height).toBeLessThanOrEqual(layout.height); }); });
 it("rotates crop dimensions and keeps pan in oriented bounds", () => { const t = { ...defaultTransform(), rotation: 90, panX: 1, panY: -1, flipX: true }; expect(orientedDimensions(1600, 800, t)).toEqual({ width: 800, height: 1600 }); const crop = calculateCrop(1600, 800, { width: 400, height: 400 }, t); expect(crop).toEqual({ x: 0, y: 0, width: 800, height: 800 }); });
 it("exports all print presets and deliberate digital scales", () => { expect(exportDimensions("sheet", "classic")).toEqual({ width: 1200, height: 1800 }); expect(exportDimensions("sheet", "full")).toEqual({ width: 1200, height: 1800 }); expect(exportDimensions("strip", "square")).toEqual({ width: 1200, height: 1200 }); expect(outputDimensions("strip", "classic", "digital")).toEqual({ width: 300, height: 900 }); expect(outputDimensions("strip", "full", "high")).toEqual({ width: 900, height: 1350 }); });
});
describe("save queue", () => {
 it("orders writes and clears even after a storage failure", async () => { const calls: string[] = []; const repository: ProjectRepository = { read: async () => null, write: async record => { calls.push(record.project.id); if (record.project.id === "broken") throw new Error("quota"); }, clear: async () => { calls.push("clear"); } }; const queue = createSaveQueue(repository); const record = (id: string): SavedProject => ({ project: { ...newProject(), id }, files: [] }); await expect(queue.write(record("broken"))).rejects.toThrow("quota"); await Promise.all([queue.write(record("latest")), queue.clear()]); expect(calls).toEqual(["broken", "latest", "clear"]); });
});
describe("camera session lifecycle", () => {
 it("runs four countdowns and captures in order", async () => { vi.useFakeTimers(); const capture = vi.fn(async () => new File(["image"], "camera.jpg", { type: "image/jpeg" })); const phases: string[] = []; const session = runBoothSession({ ...defaultBoothConfiguration, countdown: 1, delay: 0 }, capture, progress => phases.push(`${progress.shot}:${progress.phase}`), new AbortController().signal); await vi.runAllTimersAsync(); expect(await session).toHaveLength(4); expect(capture).toHaveBeenCalledTimes(4); expect(phases[0]).toBe("1:countdown"); expect(phases.at(-1)).toBe("4:capture"); });
 it("cancels before capture and releases every track", async () => { vi.useFakeTimers(); const controller = new AbortController(), capture = vi.fn(); const session = runBoothSession(defaultBoothConfiguration, capture, () => {}, controller.signal); const assertion = expect(session).rejects.toMatchObject({ name: "AbortError" }); controller.abort(); await assertion; expect(capture).not.toHaveBeenCalled(); const stop = vi.fn(); stopCamera({ getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream); expect(stop).toHaveBeenCalledTimes(2); expect(cameraError(new DOMException("denied", "NotAllowedError"))).toMatch(/permission/); });
});

describe("source resource budget", () => {
 it("keeps current photos and releases evicted history images", () => {
  const close = vi.fn(); class Bitmap { width = 100; height = 100; close = close; }
  vi.stubGlobal("ImageBitmap", Bitmap); const store = createProjectStore();
  for (let i = 0; i < 12; i++) {
   const file = new File([], `source-${i}.png`, { type: "image/png" }); Object.defineProperty(file, "size", { value: 20 * 1024 * 1024 });
   const photo = { id: String(i), file, url: `blob:source-${i}`, width: 100, height: 100, preview: new Bitmap(), transform: defaultTransform(), effects: defaultEffects() } as unknown as Photo;
   store.replacePhotos([photo, null, null, null]);
  }
  expect(store.resources.has("11")).toBe(true); expect(store.resources.size).toBeLessThanOrEqual(7); expect(close).toHaveBeenCalled();
  store.undo(); const restoredId = store.getSnapshot().present.photos[0]!.id; expect(store.resources.has(restoredId)).toBe(true); store.dispose(); expect(store.resources.size).toBe(0);
 });
});
