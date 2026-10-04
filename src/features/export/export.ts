import type { Photo } from "../photos/types";
import { decodePhoto } from "../photos/load";
import { renderCollage } from "../collage/render";
import type { PrintFormat } from "../collage/layout";
import type { StripSettings } from "../templates/templates";
import { brand } from "@/config/brand";
export interface ExportSettings { format: PrintFormat; mimeType: "image/png" | "image/jpeg" | "image/webp"; quality?: number }
export async function exportCollage(photos: Photo[], settings: StripSettings, options: ExportSettings): Promise<Blob> {
 if (photos.length !== 4) throw new Error("Add all four photos before exporting.");
 const sources: (ImageBitmap | HTMLImageElement)[] = [];
 const canvas = document.createElement("canvas");
 try {
  for (const photo of photos) sources.push(await decodePhoto(photo.file));
  renderCollage(canvas, photos, settings, options.format, sources);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode the image.")), options.mimeType, options.quality));
 } finally { sources.forEach(source => { if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close(); }); canvas.width = 0; canvas.height = 0; }
}
export function downloadBlob(blob: Blob, format: PrintFormat) {
 const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${brand.fileName}-${format === "sheet" ? "4x6" : "2x6"}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
