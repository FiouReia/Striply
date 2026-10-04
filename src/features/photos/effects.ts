export type PhotoEffectPreset = "original" | "bw" | "sepia" | "warm" | "cool" | "vintage" | "high-contrast" | "soft";
export interface PhotoEffects {
  preset: PhotoEffectPreset;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale?: number;
  sepia?: number;
}
export const effectPresets: { id: PhotoEffectPreset; name: string }[] = [
  { id: "original", name: "Original" },
  { id: "bw", name: "Black & White" },
  { id: "sepia", name: "Sepia" },
  { id: "warm", name: "Warm" },
  { id: "cool", name: "Cool" },
  { id: "vintage", name: "Vintage" },
  { id: "high-contrast", name: "High Contrast" },
  { id: "soft", name: "Soft" },
];
interface FilterConfiguration { red: number; green: number; blue: number; lift: number; saturation: number; contrast: number; sepia: number; grayscale: number }
const neutral: FilterConfiguration = { red: 1, green: 1, blue: 1, lift: 0, saturation: 1, contrast: 1, sepia: 0, grayscale: 0 };
export const filterConfigurations: Record<PhotoEffectPreset, FilterConfiguration> = {
 original: { ...neutral }, bw: { ...neutral, grayscale: 1 }, sepia: { ...neutral, sepia: 1 },
 warm: { ...neutral, red: 1.08, green: 1.02, blue: 0.9 }, cool: { ...neutral, red: 0.9, green: 1.02, blue: 1.1 },
 vintage: { ...neutral, red: 0.9, green: 0.88, blue: 0.8, lift: 19, saturation: 0.75 },
 "high-contrast": { ...neutral, contrast: 1.4 }, soft: { ...neutral, contrast: 0.85, lift: 8, saturation: 0.9 },
};
export const defaultEffects = (): PhotoEffects => ({ preset: "original", brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0 });
export function hasPhotoEffects(effects: PhotoEffects): boolean {
  return effects.preset !== "original" || effects.brightness !== 100 || effects.contrast !== 100 || effects.saturation !== 100 || (effects.grayscale ?? 0) !== 0 || (effects.sepia ?? 0) !== 0;
}
const bounded = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(200, value)) / 100 : 1;
/** Process only the cropped frame pixels. Alpha and the original source stay untouched. */
export function applyPhotoEffects(pixels: Uint8ClampedArray, effects: PhotoEffects): void {
  if (!hasPhotoEffects(effects)) return;
  const brightness = bounded(effects.brightness);
  const contrast = bounded(effects.contrast);
  const saturation = bounded(effects.saturation);
  const config = filterConfigurations[effects.preset];
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const sourceGray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = (sourceGray + (r - sourceGray) * config.saturation) * config.red + config.lift;
    g = (sourceGray + (g - sourceGray) * config.saturation) * config.green + config.lift;
    b = (sourceGray + (b - sourceGray) * config.saturation) * config.blue + config.lift;
    const sepia = Math.max(config.sepia, (effects.sepia ?? 0) / 100);
    const grayscale = Math.max(config.grayscale, (effects.grayscale ?? 0) / 100);
    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;
    r += (sr - r) * sepia; g += (sg - g) * sepia; b += (sb - b) * sepia;
    const grayPreset = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r += (grayPreset - r) * grayscale; g += (grayPreset - g) * grayscale; b += (grayPreset - b) * grayscale;
    r = (r - 128) * config.contrast + 128; g = (g - 128) * config.contrast + 128; b = (b - 128) * config.contrast + 128;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    pixels[i] = ((gray + (r - gray) * saturation - 128) * contrast + 128) * brightness;
    pixels[i + 1] = ((gray + (g - gray) * saturation - 128) * contrast + 128) * brightness;
    pixels[i + 2] = ((gray + (b - gray) * saturation - 128) * contrast + 128) * brightness;
  }
}
