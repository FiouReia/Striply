import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function upload(page: Page) {
 const bytes = await page.evaluate(async () => {
  const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600; const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b9697e"; ctx.fillRect(0, 0, 400, 300); ctx.fillStyle = "#629783"; ctx.fillRect(400, 0, 400, 300); ctx.fillStyle = "#587aa9"; ctx.fillRect(0, 300, 400, 300); ctx.fillStyle = "#e8b95d"; ctx.fillRect(400, 300, 400, 300);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!))); return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await page.getByLabel("Choose photos", { exact: true }).setInputFiles(Array.from({ length: 4 }, (_, i) => ({ name: `v2-${i}.png`, mimeType: "image/png", buffer: Buffer.from(bytes) })));
 await expect(page.getByRole("status", { name: "Editor status" })).toContainText("4 photos added");
}
const step = (page: Page, name: string) => page.getByRole("navigation", { name: "Editor steps" }).getByRole("button", { name: new RegExp(name) }).click();
async function mockCamera(page: Page) {
 await page.addInitScript(() => {
  const state = window as unknown as { __stopped: number; __streams: MediaStream[] }; state.__stopped = 0; state.__streams = [];
  Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, writable: true, value: async () => {
   const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480; const ctx = canvas.getContext("2d")!;
   ctx.fillStyle = "#5f9983"; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = "#eedfc2"; ctx.fillRect(0, 0, 320, 480);
   const stream = canvas.captureStream(10); state.__streams.push(stream); stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { state.__stopped++; stop(); }; }); return stream;
  } });
  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { configurable: true, value: async () => [{ kind: "videoinput", deviceId: "fake-camera", label: "Mock Camera", groupId: "test" }] });
 });
}
test("layouts, text/stickers, undo/redo and JPEG export", async ({ page }) => {
 await page.goto("/"); await upload(page); await step(page, "Edit photos");
 await page.getByRole("button", { name: "Rotate right", exact: true }).click(); await page.getByRole("button", { name: "Flip horizontal", exact: true }).click();
 await expect(page.getByRole("button", { name: "Flip horizontal", exact: true })).toHaveAttribute("aria-pressed", "true");
 await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.getByRole("button", { name: "Flip horizontal", exact: true })).toHaveAttribute("aria-pressed", "false");
 await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(page.getByRole("button", { name: "Flip horizontal", exact: true })).toHaveAttribute("aria-pressed", "true");
 await step(page, "Customize"); await page.getByLabel("Layout", { exact: true }).selectOption("polaroid");
 await page.getByRole("button", { name: /Wedding Bloom/ }).click(); await page.getByRole("button", { name: "Add text", exact: true }).click(); await page.getByLabel("Text", { exact: true }).fill("Our day together");
 await page.getByText("Position, size & rotation", { exact: true }).click();
 await page.getByRole("slider", { name: "Layer rotation", exact: true }).focus(); await page.getByRole("slider", { name: "Layer rotation", exact: true }).press("ArrowRight");
 await page.getByRole("button", { name: "Add Heart sticker", exact: true }).click();
 await expect(page.getByRole("group", { name: "Composition layers" }).getByRole("button")).toHaveCount(3);
 await page.getByText("Position, size & rotation", { exact: true }).click();
 await page.getByRole("slider", { name: "Layer width", exact: true }).focus(); await page.getByRole("slider", { name: "Layer width", exact: true }).press("ArrowRight");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: `test-results/${test.info().project.name}-v2-layers.png`, fullPage: true });
 await page.getByText("Export & print options", { exact: true }).click(); await page.getByLabel("Download format", { exact: true }).selectOption("image/jpeg");
 await step(page, "Preview");
 const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: /Download JPEG/ }).click(); const download = await downloadEvent; expect(download.suggestedFilename()).toMatch(/\.jpg$/);
 const data = await readFile((await download.path())!); expect(data[0]).toBe(255); expect(data[1]).toBe(216);
 const size = await page.evaluate(async bytes => { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" })); const size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return size; }, Array.from(data)); expect(size).toEqual({ width: 1200, height: 1200 });
});
test("autosave restores original files, layers and layout after reload", async ({ page }) => {
 await page.goto("/"); await upload(page); await step(page, "Customize"); await page.getByLabel("Layout", { exact: true }).selectOption("full"); await page.getByRole("button", { name: "Add text", exact: true }).click(); await page.getByLabel("Text", { exact: true }).fill("Saved on this device");
 await expect(page.getByRole("status", { name: "Autosave status" })).toHaveText("Saved on this device");
 await page.reload(); await expect(page.getByRole("heading", { name: "Restore previous project?" })).toBeVisible(); await page.getByRole("button", { name: "Restore", exact: true }).click();
 await expect(page.getByRole("status", { name: "Autosave status" })).toContainText(/restored|Saved/); await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("full"); await expect(page.getByRole("button", { name: /Download PNG/ })).toBeEnabled();
 await step(page, "Customize"); await expect(page.getByRole("group", { name: "Composition layers" })).toContainText("Saved on this device");
 await page.reload(); await page.getByRole("button", { name: "Start New", exact: true }).click(); await expect(page.getByRole("button", { name: /Download PNG/ })).toBeDisabled();
});
test("mock camera booth captures four shots, retakes and exports", async ({ page }) => {
 await mockCamera(page); await page.goto("/"); await page.getByRole("button", { name: "Photo Booth", exact: true }).click();
 await expect(page.getByRole("button", { name: "Start Session", exact: true })).toBeEnabled(); await page.getByText("Session timing", { exact: true }).click(); await page.getByLabel("Countdown seconds", { exact: true }).fill("1"); await page.getByLabel("Pause between shots", { exact: true }).fill("0");
 await page.getByRole("button", { name: "Start Session", exact: true }).click(); await expect(page.getByRole("button", { name: "Continue to editor", exact: true })).toBeVisible({ timeout: 15000 });
 await expect(page.getByAltText(/Captured photo/)).toHaveCount(4); await page.getByRole("button", { name: "Retake photo 2", exact: true }).click(); await expect(page.getByRole("button", { name: "Retake photo 2", exact: true })).toBeEnabled();
 await page.screenshot({ path: `test-results/${test.info().project.name}-v2-booth.png`, fullPage: false });
 await page.getByRole("button", { name: "Continue to editor", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.getByRole("button", { name: /Download PNG/ })).toBeEnabled();
 expect(await page.evaluate(() => (window as unknown as { __stopped: number }).__stopped)).toBeGreaterThan(0);
 await step(page, "Customize"); await page.getByRole("button", { name: /Soft Pastel/ }).click(); await step(page, "Preview"); const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: /Download PNG/ }).click(); const download = await downloading; const png = await readFile((await download.path())!); expect(png.readUInt32BE(16)).toBe(600); expect(png.readUInt32BE(20)).toBe(1800);
});
test("camera denial is recoverable and cancelled sessions stop tracks", async ({ page }) => {
 await mockCamera(page); await page.goto("/");
 await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); }; });
 await page.getByRole("button", { name: "Use Camera", exact: true }).click(); await expect(page.getByRole("dialog").getByRole("alert")).toContainText("permission"); await expect(page.getByRole("button", { name: "Retry camera", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Close camera", exact: true }).click();
 await page.reload(); await page.getByRole("button", { name: "Photo Booth", exact: true }).click(); await expect(page.getByRole("button", { name: "Start Session", exact: true })).toBeEnabled(); await page.getByRole("button", { name: "Start Session", exact: true }).click(); await page.getByRole("button", { name: "Cancel session", exact: true }).click(); await expect(page.getByRole("button", { name: "Start Session", exact: true })).toBeVisible(); await page.getByRole("button", { name: "Close camera", exact: true }).click(); expect(await page.evaluate(() => (window as unknown as { __stopped: number }).__stopped)).toBeGreaterThan(0);
});

test("quarter-turn and flip render oriented source pixels", async ({ page }) => {
 await page.goto("/"); await upload(page); await step(page, "Edit photos");
 const pixel = () => page.locator(".strip-preview canvas").evaluate(node => { const canvas = node as HTMLCanvasElement; return Array.from(canvas.getContext("2d")!.getImageData(Math.round(100 * canvas.width / 600), Math.round(100 * canvas.height / 1800), 1, 1).data); });
 await expect.poll(pixel).toEqual([185, 105, 126, 255]);
 await page.getByRole("button", { name: "Rotate right", exact: true }).click(); await expect.poll(pixel).toEqual([88, 122, 169, 255]);
 await page.getByRole("button", { name: "Flip horizontal", exact: true }).click(); await expect.poll(pixel).toEqual([185, 105, 126, 255]);
 await page.keyboard.press("Control+z"); await expect.poll(pixel).toEqual([88, 122, 169, 255]); await page.keyboard.press("Control+Shift+z"); await expect.poll(pixel).toEqual([185, 105, 126, 255]);
});

test("future project records are preserved when restore fails", async ({ page }) => {
 await page.goto("/"); await upload(page); await expect(page.getByRole("status", { name: "Autosave status" })).toHaveText("Saved on this device");
 await page.evaluate(async () => { await new Promise<void>((resolve, reject) => { const request = indexedDB.open("striply-projects", 2); request.onsuccess = () => { const db = request.result, tx = db.transaction("projects", "readwrite"), store = tx.objectStore("projects"), get = store.get("unfinished"); get.onsuccess = () => { const saved = get.result; saved.project.version = 99; store.put(saved, "unfinished"); }; tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(new Error("test setup failed")); }; }); });
 await page.reload(); await page.getByRole("button", { name: "Restore", exact: true }).click(); await expect(page.getByRole("status", { name: "Autosave status" })).toContainText("unsupported version"); await expect(page.getByRole("heading", { name: "Restore previous project?" })).toBeVisible();
 const version = await page.evaluate(async () => new Promise<number>(resolve => { const request = indexedDB.open("striply-projects", 2); request.onsuccess = () => { const db = request.result, tx = db.transaction("projects", "readonly"), get = tx.objectStore("projects").get("unfinished"); get.onsuccess = () => resolve(get.result.project.version); tx.oncomplete = () => db.close(); }; })); expect(version).toBe(99);
});
