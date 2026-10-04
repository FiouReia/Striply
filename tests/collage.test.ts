import { describe, expect, it } from "vitest";
import { calculateCrop, calculateLayout, exportDimensions } from "../src/features/collage/layout";
import { templates } from "../src/features/templates/templates";
import { validateFile, MAX_BYTES } from "../src/features/photos/load";
describe("physical collage geometry", () => {
 it("creates exact 300-DPI strip and sheet dimensions", () => { expect(exportDimensions("strip")).toEqual({ width: 600, height: 1800 }); expect(exportDimensions("sheet")).toEqual({ width: 1200, height: 1800 }); });
 it.each(templates)("fits four frames and footer inside $name", template => {
  const layout = calculateLayout(template.settings); expect(layout.frames).toHaveLength(4);
  layout.frames.forEach((frame, index) => { expect(frame.x).toBeGreaterThan(0); expect(frame.x + frame.width).toBeLessThan(600); expect(frame.y + frame.height).toBeLessThanOrEqual(layout.footer?.y ?? 1764); if (index) expect(frame.y - (layout.frames[index - 1].y + layout.frames[index - 1].height)).toBeCloseTo(template.settings.spacing); });
 });
 it("uses extra space for photos when footer is hidden", () => { const withFooter = calculateLayout(templates[0].settings); const without = calculateLayout({ ...templates[0].settings, showFooter: false }); expect(without.footer).toBeNull(); expect(without.frames[0].height).toBeGreaterThan(withFooter.frames[0].height); expect(without.frames[3].y + without.frames[3].height).toBe(1764); });
});
describe("crop calculations", () => {
 it("center-crops a wide source using cover-fit", () => { expect(calculateCrop(1600, 800, { width: 400, height: 400 }, { zoom: 1, panX: 0, panY: 0 })).toEqual({ x: 400, y: 0, width: 800, height: 800 }); });
 it("zooms without changing the source and reaches both edges", () => { const frame = { width: 400, height: 400 }; expect(calculateCrop(1600, 800, frame, { zoom: 2, panX: -1, panY: -1 })).toEqual({ x: 0, y: 0, width: 400, height: 400 }); expect(calculateCrop(1600, 800, frame, { zoom: 2, panX: 1, panY: 1 })).toEqual({ x: 1200, y: 400, width: 400, height: 400 }); });
 it("keeps crops in bounds for portrait and landscape sources", () => { for (const [w, h] of [[6000, 4000], [4000, 6000], [800, 800]]) for (const zoom of [0.5, 1, 1.8, 3, 5]) for (const pan of [-2, -1, 0, 1, 2]) { const frame = calculateLayout(templates[0].settings).frames[0]; const crop = calculateCrop(w, h, frame, { zoom, panX: pan, panY: -pan }); expect(crop.x).toBeGreaterThanOrEqual(0); expect(crop.y).toBeGreaterThanOrEqual(0); expect(crop.x + crop.width).toBeLessThanOrEqual(w + 1e-8); expect(crop.y + crop.height).toBeLessThanOrEqual(h + 1e-8); expect(crop.width / crop.height).toBeCloseTo(frame.width / frame.height); } });
});
describe("templates and input validation", () => {
 it("has unique templates, valid colors and bounded settings", () => { expect(new Set(templates.map(t => t.id)).size).toBe(templates.length); templates.forEach(t => { expect(t.settings.background).toMatch(/^#[0-9a-f]{6}$/i); expect(t.settings.foreground).toMatch(/^#[0-9a-f]{6}$/i); expect(t.settings.spacing).toBeGreaterThanOrEqual(8); expect(t.settings.spacing).toBeLessThanOrEqual(40); expect(t.settings.radius).toBeGreaterThanOrEqual(0); }); });
 it("accepts supported files and rejects wrong types, empty or huge files", () => { for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateFile({ type, size: 100 })).toBeNull(); expect(validateFile({ type: "image/svg+xml", size: 100 })).toMatch(/JPEG/); expect(validateFile({ type: "image/png", size: 0 })).toMatch(/empty/); expect(validateFile({ type: "image/png", size: MAX_BYTES + 1 })).toMatch(/20 MB/); });
});
