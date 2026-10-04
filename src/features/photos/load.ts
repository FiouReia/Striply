import { defaultEffects } from "./effects";
import { defaultTransform, type Photo } from "./types";
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export function validateFile(file: Pick<File, "type" | "size">): string | null {
 if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPEG, PNG or WebP photo.";
 if (file.size === 0) return "This file is empty. Choose another photo.";
 if (file.size > MAX_BYTES) return "Each photo must be 20 MB or smaller.";
 return null;
}
export async function decodePhoto(file: File): Promise<ImageBitmap | HTMLImageElement> {
 if (typeof createImageBitmap === "function") return createImageBitmap(file);
 const url = URL.createObjectURL(file);
 try { const image = new Image(); image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}
export async function loadPhoto(file: File): Promise<Photo> {
 const error = validateFile(file); if (error) throw new Error(error);
 let original: ImageBitmap | HTMLImageElement;
 try { original = await decodePhoto(file); } catch { throw new Error("This photo could not be opened. Try another JPEG, PNG or WebP."); }
 const width = original instanceof HTMLImageElement ? original.naturalWidth : original.width;
 const height = original instanceof HTMLImageElement ? original.naturalHeight : original.height;
 if (!width || !height || width * height > MAX_PIXELS) { if (original instanceof ImageBitmap) original.close(); throw new Error("Choose a photo under 40 megapixels."); }
 let preview = original;
 if (original instanceof ImageBitmap && Math.max(width, height) > 1400) {
  try { preview = await createImageBitmap(original, { resizeWidth: Math.round(width * Math.min(1, 1400 / Math.max(width, height))), resizeHeight: Math.round(height * Math.min(1, 1400 / Math.max(width, height))), resizeQuality: "high" }); } finally { original.close(); }
 }
 return { id: crypto.randomUUID(), file, url: URL.createObjectURL(file), width, height, preview, transform: defaultTransform(), effects: defaultEffects() };
}
export function releasePhoto(photo: Photo) { URL.revokeObjectURL(photo.url); if (typeof ImageBitmap !== "undefined" && photo.preview instanceof ImageBitmap) photo.preview.close(); }
