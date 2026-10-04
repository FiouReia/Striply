import { fonts } from "../layers/types";
import { drawOrientedPhoto } from "./draw-photo";
import { renderLayers } from "../layers/render-layers";
import type { EditableLayer } from "../layers/types";
export interface RenderOptions { layoutId?: string; layers?: EditableLayer[]; assets?: Map<string, HTMLImageElement>; cutGuide?: boolean }
import { applyPhotoEffects, hasPhotoEffects } from "../photos/effects";
import type { Photo } from "../photos/types";
import type { StripSettings } from "../templates/templates";
import { calculateCrop, calculateLayout, exportDimensions, type PrintFormat } from "./layout";
export function renderCollage(canvas: HTMLCanvasElement, photos: (Photo | null)[], settings: StripSettings, format: PrintFormat, sources?: CanvasImageSource[], scale = 1, options: RenderOptions = {}) {
 const dimensions = exportDimensions(format, options.layoutId); canvas.width = Math.round(dimensions.width * scale); canvas.height = Math.round(dimensions.height * scale);
 const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Your browser could not create an image canvas.");
 ctx.scale(scale, scale); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
 const layout = calculateLayout(settings, options.layoutId);
 const effectFrames = new Map<number, HTMLCanvasElement>();
 for (let strip = 0; strip < dimensions.width / layout.width; strip++) {
  ctx.save(); ctx.translate(strip * layout.width, 0); ctx.fillStyle = settings.background; ctx.fillRect(0, 0, layout.width, layout.height);
  layout.frames.forEach((frame, index) => {
   if (options.layoutId === "polaroid") { ctx.fillStyle = "#ffffff"; ctx.fillRect(frame.x - 20, frame.y - 20, frame.width + 40, frame.height + 70); }
   ctx.save(); ctx.beginPath(); ctx.roundRect(frame.x, frame.y, frame.width, frame.height, Math.min(settings.radius, frame.height / 2)); ctx.clip();
   const photo = photos[index];
   if (photo) {
    const source = sources?.[index] ?? photo.preview;
    const sw = source instanceof HTMLImageElement ? source.naturalWidth : (source as ImageBitmap).width;
    const sh = source instanceof HTMLImageElement ? source.naturalHeight : (source as ImageBitmap).height;
    const crop = calculateCrop(sw, sh, frame, photo.transform);
    if (hasPhotoEffects(photo.effects)) {
     let filtered = effectFrames.get(index);
     if (!filtered) {
      filtered = document.createElement("canvas");
      filtered.width = Math.max(1, Math.round(frame.width * scale));
      filtered.height = Math.max(1, Math.round(frame.height * scale));
      const effectCtx = filtered.getContext("2d", { willReadFrequently: true });
      if (!effectCtx) throw new Error("Could not apply photo effects.");
      effectCtx.imageSmoothingEnabled = true; effectCtx.imageSmoothingQuality = "high";
      drawOrientedPhoto(effectCtx, source, sw, sh, crop, { x: 0, y: 0, width: filtered.width, height: filtered.height }, photo.transform);
      const pixels = effectCtx.getImageData(0, 0, filtered.width, filtered.height);
      applyPhotoEffects(pixels.data, photo.effects);
      effectCtx.putImageData(pixels, 0, 0);
      effectFrames.set(index, filtered);
     }
     ctx.drawImage(filtered, frame.x, frame.y, frame.width, frame.height);
    } else {
     drawOrientedPhoto(ctx, source, sw, sh, crop, frame, photo.transform);
    }
   } else {
    ctx.fillStyle = settings.background === "#222323" ? "#343737" : "#e9e6de"; ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
    ctx.fillStyle = settings.foreground; ctx.globalAlpha = 0.4; ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.fillText(`PHOTO ${index + 1}`, frame.x + frame.width / 2, frame.y + frame.height / 2);
   }
   ctx.restore();
   if (settings.border) { ctx.strokeStyle = settings.foreground; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(frame.x + 1, frame.y + 1, frame.width - 2, frame.height - 2, settings.radius); ctx.stroke(); }
  });
  if (layout.footer) {
   const footer = layout.footer; ctx.fillStyle = settings.foreground; ctx.textAlign = "center"; ctx.font = `bold 30px ${fonts[settings.font ?? "serif"]}`; ctx.fillText(settings.title, layout.width / 2, footer.y + 65, footer.width - 18);
   ctx.font = "17px sans-serif"; ctx.fillText(settings.date, layout.width / 2, footer.y + 104, footer.width - 18);
   ctx.font = "italic 20px Georgia, serif"; ctx.fillText(settings.footer, layout.width / 2, footer.y + 144, footer.width - 18);
  }
  renderLayers(ctx, options.layers ?? [], options.assets ?? new Map());
  ctx.restore();
 }
 if (options.cutGuide && dimensions.width > layout.width) { ctx.strokeStyle = "#808080"; ctx.lineWidth = 1; ctx.setLineDash([12, 12]); ctx.beginPath(); ctx.moveTo(layout.width, 0); ctx.lineTo(layout.width, layout.height); ctx.stroke(); }
 effectFrames.forEach(frame => { frame.width = 0; frame.height = 0; });
}
