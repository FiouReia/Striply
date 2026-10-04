"use client";
import { useEffect, useRef } from "react";
import type { Photo, PhotoTransform } from "../photos/types";
import type { StripSettings } from "../templates/templates";
import { calculateCrop, calculateLayout, orientedDimensions, clamp, type PrintFormat } from "../collage/layout";
import { loadStickerAssets } from "../layers/stickers";
import type { EditableLayer } from "../layers/types";
import { renderCollage } from "../collage/render";
export function StripPreview({ photos, settings, format, selected, editable, onSelect, onTransform, layoutId = "classic", layers = [], selectedLayer, onLayerSelect, onLayerChange, guides = false, margins = false }: { photos: (Photo | null)[]; settings: StripSettings; format: PrintFormat; selected: number; editable: boolean; onSelect: (index: number) => void; onTransform: (index: number, transform: PhotoTransform) => void; layoutId?: string; layers?: EditableLayer[]; selectedLayer?: string | null; onLayerSelect?: (id: string) => void; onLayerChange?: (layer: EditableLayer) => void; guides?: boolean; margins?: boolean }) {
 const canvas = useRef<HTMLCanvasElement>(null);
 const drag = useRef<{ x: number; y: number; transform: PhotoTransform; index: number } | null>(null);
 const layout = calculateLayout(settings, layoutId);
 useEffect(() => {
  let cancelled = false; let frame = 0;
  const draw = (assets?: Map<string, HTMLImageElement>) => { frame = requestAnimationFrame(() => { if (!cancelled && canvas.current) renderCollage(canvas.current, photos, settings, format, undefined, layout.width === 600 ? 0.7 : 0.5, { layoutId, layers, assets }); }); };
  if (layers.some(layer => layer.type === "sticker")) void loadStickerAssets().then(draw).catch(() => draw()); else draw();
  return () => { cancelled = true; cancelAnimationFrame(frame); };
 }, [photos, settings, format, layoutId, layers, layout.width]);
 const strips = format === "sheet" && layout.width === 600 ? 2 : 1;
 const layerDrag = useRef<{ x: number; y: number; layer: EditableLayer } | null>(null);
 return <div className={`strip-preview ${format} ${layout.width !== 600 ? "grid-preview" : ""}`}>
  <canvas ref={canvas} role="img" aria-label={format === "sheet" ? "Two identical photo strips on a 4 by 6 inch sheet" : "Live 2 by 6 inch photo strip preview"} />
  {editable && layout.frames.flatMap((frame, index) => Array.from({ length: strips }, (_, strip) => <button key={`${strip}-${index}`} className={`photo-hit ${selected === index ? "selected" : ""}`} aria-label={`Edit photo ${index + 1}`} style={{ left: `${(frame.x + strip * layout.width) / (layout.width * strips) * 100}%`, top: `${frame.y / layout.height * 100}%`, width: `${frame.width / (layout.width * strips) * 100}%`, height: `${frame.height / layout.height * 100}%`, borderRadius: `${settings.radius / 600 * 100}cqw` }}
   onPointerDown={event => { onSelect(index); const photo = photos[index]; if (!photo) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, transform: { ...photo.transform }, index }; }}
   onPointerMove={event => {
    const start = drag.current, photo = photos[index]; if (!start || start.index !== index || !photo) return;
    const rect = event.currentTarget.getBoundingClientRect(); const crop = calculateCrop(photo.width, photo.height, frame, start.transform);
    const oriented = orientedDimensions(photo.width, photo.height, start.transform); const spanX = oriented.width - crop.width, spanY = oriented.height - crop.height;
    onTransform(index, { ...start.transform, panX: spanX > 0.01 ? clamp(start.transform.panX - (event.clientX - start.x) / rect.width * crop.width * 2 / spanX) : 0, panY: spanY > 0.01 ? clamp(start.transform.panY - (event.clientY - start.y) / rect.height * crop.height * 2 / spanY) : 0 });
   }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
   onKeyDown={event => { const photo = photos[index]; if (!photo || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); onSelect(index); const t = photo.transform; onTransform(index, { ...t, panX: clamp(t.panX + (event.key === "ArrowLeft" ? -0.05 : event.key === "ArrowRight" ? 0.05 : 0)), panY: clamp(t.panY + (event.key === "ArrowUp" ? -0.05 : event.key === "ArrowDown" ? 0.05 : 0)) }); }}>
   {!photos[index] && <span className="slot-plus">+</span>}
  </button>))}
  {margins && <div className="margin-guide" style={{ borderWidth: `${24 / (layout.width * strips) * 100}cqw` }} aria-hidden="true" />}
  {guides && Array.from({ length: strips }, (_, strip) => <div key={strip} className="safe-guide" style={{ left: `${(strip * layout.width + 36) / (layout.width * strips) * 100}%`, top: `${36 / layout.height * 100}%`, width: `${(layout.width - 72) / (layout.width * strips) * 100}%`, height: `${(layout.height - 72) / layout.height * 100}%` }} aria-hidden="true" />)}
  {editable && layers.map(layer => layer.visible && <button key={layer.id} className={`layer-hit ${selectedLayer === layer.id ? "selected" : ""}`} aria-label={`Select ${layer.type} layer`} style={{ left: `${layer.x / (layout.width * strips) * 100}%`, top: `${layer.y / layout.height * 100}%`, width: `${layer.width / (layout.width * strips) * 100}%`, height: `${layer.height / layout.height * 100}%`, transform: `rotate(${layer.rotation}deg)` }}
   onPointerDown={event => { onLayerSelect?.(layer.id); event.currentTarget.setPointerCapture(event.pointerId); layerDrag.current = { x: event.clientX, y: event.clientY, layer }; }}
   onPointerMove={event => { const start = layerDrag.current; if (!start || start.layer.id !== layer.id) return; const rect = canvas.current!.getBoundingClientRect(); onLayerChange?.({ ...start.layer, x: clamp(start.layer.x + (event.clientX - start.x) / rect.width * layout.width * strips, 0, layout.width - layer.width), y: clamp(start.layer.y + (event.clientY - start.y) / rect.height * layout.height, 0, layout.height - layer.height) }); }}
   onPointerUp={() => { layerDrag.current = null; }} onPointerCancel={() => { layerDrag.current = null; }}
   onKeyDown={event => { const dx = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0, dy = event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0; if (dx || dy) { event.preventDefault(); onLayerSelect?.(layer.id); onLayerChange?.({ ...layer, x: clamp(layer.x + dx, 0, layout.width - layer.width), y: clamp(layer.y + dy, 0, layout.height - layer.height) }); } }} />)}
 </div>;
}
