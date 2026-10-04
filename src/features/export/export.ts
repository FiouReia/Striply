import type { Photo } from "../photos/types";
import { decodePhoto } from "../photos/load";
import { getLayout, exportDimensions } from "../collage/layout";
import type { RenderOptions } from "../collage/render";
import { loadStickerAssets } from "../layers/stickers";
import { renderCollage } from "../collage/render";
import type { PrintFormat } from "../collage/layout";
import type { StripSettings } from "../templates/templates";
import { brand } from "@/config/brand";
export interface ExportSettings { format: PrintFormat; mimeType: "image/png" | "image/jpeg" | "image/webp"; quality?: number; resolution?: "digital" | "high" | "print"; render?: RenderOptions }
export async function exportCollage(photos: Photo[], settings: StripSettings, options: ExportSettings): Promise<Blob> {
 if (photos.length < getLayout(options.render?.layoutId).photoCount) throw new Error("Add all photos for this layout before exporting.");
 const sources: (ImageBitmap | HTMLImageElement)[] = [];
 const canvas = document.createElement("canvas");
 try {
  for (const photo of photos) sources.push(await decodePhoto(photo.file));
  const assets = options.render?.layers?.some(layer => layer.type === "sticker") ? await loadStickerAssets() : undefined;
  const scale = exportScale(options.resolution ?? "print");
  renderCollage(canvas, photos, settings, options.format, sources, scale, { ...options.render, assets });
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not encode the image.")), options.mimeType, Math.max(0.7, Math.min(0.98, options.quality ?? 0.92))));
 } finally { sources.forEach(source => { if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close(); }); canvas.width = 0; canvas.height = 0; }
}
export function downloadBlob(blob: Blob, format: PrintFormat, layoutId = "classic") {
 const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${brand.fileName}-${getLayout(layoutId).kind === "strip" ? format === "sheet" ? "4x6" : "2x6" : layoutId}-${blob.type === "image/jpeg" ? "photo.jpg" : "photo.png"}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportScale(quality: "digital" | "high" | "print") { return quality === "digital" ? 0.5 : quality === "high" ? 0.75 : 1; }
export function outputDimensions(format: PrintFormat, layoutId: string, quality: "digital" | "high" | "print") { const size = exportDimensions(format, layoutId), scale = exportScale(quality); return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }; }
