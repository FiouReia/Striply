import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function fixtures(page: Page) {
 return page.evaluate(async () => {
  const values = [];
  for (let i = 0; i < 4; i++) { const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 800; const c = canvas.getContext("2d")!; c.fillStyle = ["#e39b89", "#91b4a0", "#819ec3", "#d9bc72"][i]; c.fillRect(0, 0, 1000, 800); c.fillStyle = "#fff"; c.fillRect(i * 180 + 60, 200, 200, 400); const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), "image/png")); values.push(Array.from(new Uint8Array(await blob.arrayBuffer()))); }
  return values;
 });
}
test("four photos to edited, customized print-resolution PNGs", async ({ page }) => {
 await page.goto("/"); const files = await fixtures(page); await page.getByLabel("Choose photos", { exact: true }).setInputFiles(files.map((bytes, i) => ({ name: `photo-${i}.png`, mimeType: "image/png", buffer: Buffer.from(bytes) })));
 await expect(page.getByRole("status", { name: "Editor status" })).toContainText("4 photos added");
 const firstSource = await page.getByRole("button", { name: "Select photo 1", exact: true }).locator("img").getAttribute("src");
 await page.getByRole("button", { name: "Move photo 1 down", exact: true }).click();
 await expect(page.getByRole("button", { name: "Select photo 2", exact: true }).locator("img")).toHaveAttribute("src", firstSource!);
 await page.getByRole("button", { name: "Edit photos", exact: false }).first().click();
 await page.getByRole("slider", { name: "Zoom", exact: true }).focus();
 await page.getByRole("slider", { name: "Zoom", exact: true }).press("End");
 await expect(page.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("3");
 await page.getByRole("button", { name: "Edit photo 3", exact: true }).focus();
 await page.getByRole("button", { name: "Edit photo 3", exact: true }).press("ArrowRight");
 await expect(page.getByRole("slider", { name: "Horizontal position", exact: true })).toHaveValue("0.05");
 await expect(page.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("1");
 await page.getByRole("button", { name: /Reset photo/ }).click();
 await expect(page.getByRole("slider", { name: "Horizontal position", exact: true })).toHaveValue("0");
 await page.getByRole("button", { name: "Edit photo 2", exact: true }).click();
 await expect(page.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("3");
 const frame = await page.getByRole("button", { name: "Edit photo 2", exact: true }).boundingBox();
 await page.mouse.move(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2); await page.mouse.down(); await page.mouse.move(frame!.x + frame!.width / 2 + 20, frame!.y + frame!.height / 2); await page.mouse.up();
 await expect(page.getByRole("slider", { name: "Horizontal position", exact: true })).not.toHaveValue("0");
 await page.getByRole("button", { name: "Customize", exact: false }).first().click();
 await page.getByRole("button", { name: /Soft Pastel/ }).click(); await page.getByLabel("Strip title", { exact: true }).fill("Our favorite day");
 await page.getByRole("button", { name: "Preview", exact: false }).first().click();
 for (const [format, width] of [["Single 2×6 Strip", 600], ["4×6 Print Sheet", 1200]] as const) {
  await page.getByRole("button", { name: format, exact: true }).click(); const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Download PNG", exact: false }).click(); const download = await downloadEvent; const filePath = await download.path(); const png = await readFile(filePath!); expect(png.readUInt32BE(16)).toBe(width); expect(png.readUInt32BE(20)).toBe(1800);
  if (width === 1200) {
   const equal = await page.evaluate(async bytes => { const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" })); const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 1800; const ctx = canvas.getContext("2d")!; ctx.drawImage(bitmap, 0, 0); bitmap.close(); const a = ctx.getImageData(0, 0, 600, 1800).data, b = ctx.getImageData(600, 0, 600, 1800).data; return a.every((value, i) => value === b[i]); }, Array.from(png)); expect(equal).toBe(true);
  }
 }
 const popupEvent = page.waitForEvent("popup");
 await page.evaluate(() => { const open = window.open.bind(window); window.open = (...args) => { const win = open(...args); if (win) win.print = () => { win.document.body.dataset.printRequested = "true"; }; return win; }; });
 await page.getByRole("button", { name: /^Print/ }).click();
 const popup = await popupEvent; await expect(popup.locator("body")).toHaveAttribute("data-print-requested", "true");
 await expect(popup.locator("img")).toHaveJSProperty("naturalWidth", 1200); await expect(popup.locator("img")).toHaveJSProperty("naturalHeight", 1800);
 expect(await popup.locator("img").evaluate(image => getComputedStyle(image).width)).toBe("384px"); await popup.close();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.getByRole("button", { name: "Switch to dark theme" }).click();
 await page.screenshot({ path: `test-results/${test.info().project.name}-dark.png`, fullPage: true });
 await page.getByRole("button", { name: "Switch to light theme" }).click();
 await page.screenshot({ path: `test-results/${test.info().project.name}-preview.png`, fullPage: true });
});
test("invalid files report an error and export remains disabled", async ({ page }) => {
 await page.goto("/"); await page.getByLabel("Choose photos", { exact: true }).setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }); await expect(page.getByRole("alert", { name: "Photo error" })).toContainText("JPEG, PNG or WebP"); await expect(page.getByRole("button", { name: "Download PNG" })).toBeDisabled();
 await page.getByLabel("Choose photos", { exact: true }).setInputFiles({ name: "corrupt.png", mimeType: "image/png", buffer: Buffer.from("not a png") }); await expect(page.getByRole("alert", { name: "Photo error" })).toContainText("could not be opened");
});

test("individual photo effects survive cropping, reordering and PNG export", async ({ page }) => {
 await page.goto("/");
 const files = await fixtures(page);
 await page.getByLabel("Choose photos", { exact: true }).setInputFiles(files.map((bytes, i) => ({ name: `effect-${i}.png`, mimeType: "image/png", buffer: Buffer.from(bytes) })));
 await expect(page.getByRole("status", { name: "Editor status" })).toContainText("4 photos added");
 await page.getByRole("navigation", { name: "Editor steps" }).getByRole("button", { name: /Edit photos/ }).click();
 const bw = page.getByRole("button", { name: "Black & White", exact: true });
 await bw.click(); await expect(bw).toHaveAttribute("aria-pressed", "true");
 await page.getByRole("slider", { name: "Brightness", exact: true }).focus(); await page.getByRole("slider", { name: "Brightness", exact: true }).press("ArrowRight");
 await page.getByRole("slider", { name: "Zoom", exact: true }).focus(); await page.getByRole("slider", { name: "Zoom", exact: true }).press("End");
 await page.locator(".photo-tabs").getByRole("button", { name: "2", exact: true }).click();
 await expect(page.getByRole("button", { name: "Original", exact: true })).toHaveAttribute("aria-pressed", "true");
 await expect(page.getByRole("slider", { name: "Brightness", exact: true })).toHaveValue("100");
 await page.locator(".photo-tabs").getByRole("button", { name: "1", exact: true }).click();
 await expect(bw).toHaveAttribute("aria-pressed", "true"); await expect(page.getByRole("slider", { name: "Brightness", exact: true })).toHaveValue("101");
 await page.getByRole("button", { name: "Reset effects", exact: true }).click();
 await expect(page.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("3");
 await expect(page.getByRole("slider", { name: "Brightness", exact: true })).toHaveValue("100");
 await bw.click();
 await page.getByRole("button", { name: /Reset photo/ }).click();
 await expect(page.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("1");
 await expect(page.getByRole("button", { name: "Original", exact: true })).toHaveAttribute("aria-pressed", "true");
 await bw.click(); await page.getByRole("slider", { name: "Zoom", exact: true }).focus(); await page.getByRole("slider", { name: "Zoom", exact: true }).press("End");
 await page.screenshot({ path: `test-results/${test.info().project.name}-effects.png`, fullPage: true });
 const previewColors = await page.locator(".strip-preview canvas").evaluate(node => {
  const canvas = node as HTMLCanvasElement, ctx = canvas.getContext("2d")!;
  const sample = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x * canvas.width / 600), Math.round(y * canvas.height / 1800), 1, 1).data);
  return { edited: sample(100, 100), untouched: sample(100, 480), paper: sample(10, 10) };
 });
 expect(previewColors.edited[0]).toBe(previewColors.edited[1]); expect(previewColors.edited[1]).toBe(previewColors.edited[2]);
 expect(previewColors.untouched[0]).not.toBe(previewColors.untouched[1]); expect(previewColors.paper).toEqual([255, 253, 248, 255]);
 await page.getByRole("navigation", { name: "Editor steps" }).getByRole("button", { name: /Add photos/ }).click();
 await page.getByRole("button", { name: "Move photo 1 down", exact: true }).click();
 await page.getByRole("navigation", { name: "Editor steps" }).getByRole("button", { name: /Edit photos/ }).click();
 await expect(bw).toHaveAttribute("aria-pressed", "true"); await expect(page.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("3");
 await page.getByRole("navigation", { name: "Editor steps" }).getByRole("button", { name: /Preview/ }).click();
 const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: /Download PNG/ }).click();
 const download = await downloading; const bytes = await readFile((await download.path())!);
 const colors = await page.evaluate(async bytes => {
  const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0); image.close();
  return { edited: Array.from(ctx.getImageData(100, 480, 1, 1).data), untouched: Array.from(ctx.getImageData(100, 100, 1, 1).data), paper: Array.from(ctx.getImageData(10, 10, 1, 1).data) };
 }, Array.from(bytes));
 expect(colors.edited[0]).toBe(colors.edited[1]); expect(colors.edited[1]).toBe(colors.edited[2]); expect(colors.untouched[0]).not.toBe(colors.untouched[1]); expect(colors.paper).toEqual([255, 253, 248, 255]);
});
