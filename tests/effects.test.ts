import { describe, expect, it } from "vitest";
import { applyPhotoEffects, defaultEffects, effectPresets } from "../src/features/photos/effects";
function pixel(effects = defaultEffects()) {
 const data = new Uint8ClampedArray([180, 100, 60, 128]);
 applyPhotoEffects(data, effects);
 return Array.from(data);
}
describe("photo effects", () => {
 it("leaves neutral pixels and alpha unchanged", () => { expect(pixel()).toEqual([180, 100, 60, 128]); });
 it("makes black and white and zero saturation achromatic", () => {
  for (const settings of [{ ...defaultEffects(), preset: "bw" as const }, { ...defaultEffects(), saturation: 0 }]) {
   const [r, g, b, a] = pixel(settings); expect(r).toBe(g); expect(g).toBe(b); expect(a).toBe(128);
  }
 });
 it("changes color temperature in the expected direction", () => {
  const warm = pixel({ ...defaultEffects(), preset: "warm" }), cool = pixel({ ...defaultEffects(), preset: "cool" });
  expect(warm[0]).toBeGreaterThan(180); expect(warm[2]).toBeLessThan(60);
  expect(cool[0]).toBeLessThan(180); expect(cool[2]).toBeGreaterThan(60);
 });
 it("makes sepia warm and vintage muted while preserving alpha", () => {
  for (const preset of ["sepia", "vintage"] as const) {
   const result = pixel({ ...defaultEffects(), preset }); expect(result[0]).toBeGreaterThan(result[1]); expect(result[1]).toBeGreaterThan(result[2]); expect(result[3]).toBe(128); expect(result).not.toEqual(pixel());
  }
 });
 it("handles adjustment extremes and clamps output", () => {
  expect(pixel({ ...defaultEffects(), brightness: 0 })).toEqual([0, 0, 0, 128]);
  expect(pixel({ ...defaultEffects(), contrast: 0 })).toEqual([128, 128, 128, 128]);
  expect(pixel({ ...defaultEffects(), brightness: 200 })).toEqual([255, 200, 120, 128]);
  expect(pixel({ ...defaultEffects(), brightness: Number.NaN })).toEqual(pixel());
 });
 it("keeps effect defaults independent between photos", () => {
  const first = defaultEffects(), second = defaultEffects(); first.brightness = 150; expect(second.brightness).toBe(100);
  expect(new Set(effectPresets.map(p => p.id)).size).toBe(effectPresets.length);
 });
});
