"use client";
import { useEffect, useRef } from "react";
import type { Photo, PhotoTransform } from "../photos/types";
import type { StripSettings } from "../templates/templates";
import { calculateCrop, calculateLayout, clamp, type PrintFormat } from "../collage/layout";
import { renderCollage } from "../collage/render";
export function StripPreview({ photos, settings, format, selected, editable, onSelect, onTransform }: { photos: (Photo | null)[]; settings: StripSettings; format: PrintFormat; selected: number; editable: boolean; onSelect: (index: number) => void; onTransform: (index: number, transform: PhotoTransform) => void }) {
 const canvas = useRef<HTMLCanvasElement>(null);
 const drag = useRef<{ x: number; y: number; transform: PhotoTransform; index: number } | null>(null);
 const layout = calculateLayout(settings);
 useEffect(() => { if (canvas.current) renderCollage(canvas.current, photos, settings, format, undefined, 0.7); }, [photos, settings, format]);
 const strips = format === "sheet" ? 2 : 1;
 return <div className={`strip-preview ${format}`}>
  <canvas ref={canvas} role="img" aria-label={format === "sheet" ? "Two identical photo strips on a 4 by 6 inch sheet" : "Live 2 by 6 inch photo strip preview"} />
  {editable && layout.frames.flatMap((frame, index) => Array.from({ length: strips }, (_, strip) => <button key={`${strip}-${index}`} className={`photo-hit ${selected === index ? "selected" : ""}`} aria-label={`Edit photo ${index + 1}`} style={{ left: `${(frame.x + strip * 600) / (600 * strips) * 100}%`, top: `${frame.y / 1800 * 100}%`, width: `${frame.width / (600 * strips) * 100}%`, height: `${frame.height / 1800 * 100}%`, borderRadius: `${settings.radius / 600 * 100}cqw` }}
   onPointerDown={event => { onSelect(index); const photo = photos[index]; if (!photo) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, transform: { ...photo.transform }, index }; }}
   onPointerMove={event => {
    const start = drag.current, photo = photos[index]; if (!start || start.index !== index || !photo) return;
    const rect = event.currentTarget.getBoundingClientRect(); const crop = calculateCrop(photo.width, photo.height, frame, start.transform);
    const spanX = photo.width - crop.width, spanY = photo.height - crop.height;
    onTransform(index, { ...start.transform, panX: spanX > 0.01 ? clamp(start.transform.panX - (event.clientX - start.x) / rect.width * crop.width * 2 / spanX) : 0, panY: spanY > 0.01 ? clamp(start.transform.panY - (event.clientY - start.y) / rect.height * crop.height * 2 / spanY) : 0 });
   }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
   onKeyDown={event => { const photo = photos[index]; if (!photo || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); onSelect(index); const t = photo.transform; onTransform(index, { ...t, panX: clamp(t.panX + (event.key === "ArrowLeft" ? -0.05 : event.key === "ArrowRight" ? 0.05 : 0)), panY: clamp(t.panY + (event.key === "ArrowUp" ? -0.05 : event.key === "ArrowDown" ? 0.05 : 0)) }); }}>
   {!photos[index] && <span className="slot-plus">+</span>}
  </button>))}
 </div>;
}
