import type { PhotoTransform } from "../photos/types";
import type { StripSettings } from "../templates/templates";
export interface Rect { x: number; y: number; width: number; height: number }
export interface CollageLayout { width: number; height: number; frames: Rect[]; footer: Rect | null }
export type PrintFormat = "strip" | "sheet";
export function exportDimensions(format: PrintFormat) { return { width: format === "sheet" ? 1200 : 600, height: 1800 }; }
export function calculateLayout(settings: StripSettings): CollageLayout {
 const margin = 36, top = 36, gap = Math.max(8, Math.min(40, settings.spacing));
 const footerHeight = settings.showFooter ? 180 : 0;
 const height = (1800 - top - margin - footerHeight - gap * 3) / 4;
 return { width: 600, height: 1800, frames: Array.from({ length: 4 }, (_, i) => ({ x: margin, y: top + i * (height + gap), width: 528, height })), footer: settings.showFooter ? { x: margin, y: 1800 - margin - footerHeight, width: 528, height: footerHeight } : null };
}
export const clamp = (n: number, min = -1, max = 1) => Math.max(min, Math.min(max, n));
export function calculateCrop(width: number, height: number, frame: Pick<Rect, "width" | "height">, transform: PhotoTransform): Rect {
 const scale = Math.max(frame.width / width, frame.height / height) * clamp(transform.zoom, 1, 3);
 const cropWidth = frame.width / scale, cropHeight = frame.height / scale;
 return { x: (width - cropWidth) / 2 * (1 + clamp(transform.panX)), y: (height - cropHeight) / 2 * (1 + clamp(transform.panY)), width: cropWidth, height: cropHeight };
}
