export type PhotoEffectPreset = "original" | "bw" | "sepia" | "warm" | "cool" | "vintage";
export interface PhotoEffects {
  preset: PhotoEffectPreset;
  brightness: number;
  contrast: number;
  saturation: number;
}
export const effectPresets: { id: PhotoEffectPreset; name: string }[] = [
  { id: "original", name: "Original" },
  { id: "bw", name: "Black & White" },
  { id: "sepia", name: "Sepia" },
  { id: "warm", name: "Warm" },
  { id: "cool", name: "Cool" },
  { id: "vintage", name: "Vintage" },
];
export const defaultEffects = (): PhotoEffects => ({ preset: "original", brightness: 100, contrast: 100, saturation: 100 });
export function hasPhotoEffects(effects: PhotoEffects): boolean {
  return effects.preset !== "original" || effects.brightness !== 100 || effects.contrast !== 100 || effects.saturation !== 100;
}
const bounded = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(200, value)) / 100 : 1;
/** Process only the cropped frame pixels. Alpha and the original source stay untouched. */
export function applyPhotoEffects(pixels: Uint8ClampedArray, effects: PhotoEffects): void {
  if (!hasPhotoEffects(effects)) return;
  const brightness = bounded(effects.brightness);
  const contrast = bounded(effects.contrast);
  const saturation = bounded(effects.saturation);
  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    switch (effects.preset) {
      case "bw": {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = g = b = gray;
        break;
      }
      case "sepia": {
        const red = 0.393 * r + 0.769 * g + 0.189 * b;
        const green = 0.349 * r + 0.686 * g + 0.168 * b;
        b = 0.272 * r + 0.534 * g + 0.131 * b;
        r = red; g = green;
        break;
      }
      case "warm": r *= 1.08; g *= 1.02; b *= 0.9; break;
      case "cool": r *= 0.9; g *= 1.02; b *= 1.1; break;
      case "vintage": {
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = (gray + (r - gray) * 0.75) * 0.9 + 24;
        g = (gray + (g - gray) * 0.75) * 0.88 + 19;
        b = (gray + (b - gray) * 0.75) * 0.8 + 12;
        break;
      }
    }
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    pixels[i] = ((gray + (r - gray) * saturation - 128) * contrast + 128) * brightness;
    pixels[i + 1] = ((gray + (g - gray) * saturation - 128) * contrast + 128) * brightness;
    pixels[i + 2] = ((gray + (b - gray) * saturation - 128) * contrast + 128) * brightness;
  }
}
