import type { PhotoTransform } from "../photos/types";
import type { StripSettings } from "../templates/templates";
export interface Rect { x: number; y: number; width: number; height: number }
export interface CollageLayout { width: number; height: number; frames: Rect[]; footer: Rect | null }
export type PrintFormat = "strip" | "sheet";
export interface LayoutDefinition { id: string; name: string; width: number; height: number; photoCount: number; kind: "strip" | "grid" | "polaroid" }
export const layouts: LayoutDefinition[] = [
 { id: "classic", name: "Classic Strip", width: 600, height: 1800, photoCount: 4, kind: "strip" },
 { id: "three", name: "Three Photo Strip", width: 600, height: 1800, photoCount: 3, kind: "strip" },
 { id: "square", name: "2×2 Collage", width: 1200, height: 1200, photoCount: 4, kind: "grid" },
 { id: "polaroid", name: "Polaroid Grid", width: 1200, height: 1200, photoCount: 4, kind: "polaroid" },
 { id: "full", name: "4×6 Collage", width: 1200, height: 1800, photoCount: 4, kind: "grid" },
];
export const getLayout = (id = "classic") => layouts.find(layout => layout.id === id) ?? layouts[0];
export function exportDimensions(format: PrintFormat, layoutId = "classic") {
 const layout = getLayout(layoutId);
 return { width: layout.width * (layout.kind === "strip" && format === "sheet" ? 2 : 1), height: layout.height };
}
export function calculateLayout(settings: StripSettings, layoutId = "classic"): CollageLayout {
 const definition = getLayout(layoutId);
 const margin = 36, top = 36, gap = Math.max(8, Math.min(40, settings.spacing));
 if (definition.kind !== "strip") {
  const footerHeight = settings.showFooter ? 180 : 0;
  const cellWidth = (definition.width - margin * 2 - gap) / 2;
  const cellHeight = (definition.height - margin * 2 - footerHeight - gap) / 2;
  const inset = definition.kind === "polaroid" ? 20 : 0;
  return { width: definition.width, height: definition.height, frames: Array.from({ length: 4 }, (_, i) => ({ x: margin + (i % 2) * (cellWidth + gap) + inset, y: top + Math.floor(i / 2) * (cellHeight + gap) + inset, width: cellWidth - inset * 2, height: cellHeight - (definition.kind === "polaroid" ? 70 : 0) })), footer: settings.showFooter ? { x: margin, y: definition.height - margin - footerHeight, width: definition.width - margin * 2, height: footerHeight } : null };
 }
 const footerHeight = settings.showFooter ? 180 : 0;
 const height = (1800 - top - margin - footerHeight - gap * (definition.photoCount - 1)) / definition.photoCount;
 return { width: 600, height: 1800, frames: Array.from({ length: definition.photoCount }, (_, i) => ({ x: margin, y: top + i * (height + gap), width: 528, height })), footer: settings.showFooter ? { x: margin, y: 1800 - margin - footerHeight, width: 528, height: footerHeight } : null };
}
export const clamp = (n: number, min = -1, max = 1) => Math.max(min, Math.min(max, n));
export function calculateCrop(width: number, height: number, frame: Pick<Rect, "width" | "height">, transform: PhotoTransform): Rect {
 const oriented = orientedDimensions(width, height, transform); width = oriented.width; height = oriented.height;
 const scale = Math.max(frame.width / width, frame.height / height) * clamp(transform.zoom, 1, 3);
 const cropWidth = frame.width / scale, cropHeight = frame.height / scale;
 return { x: (width - cropWidth) / 2 * (1 + clamp(transform.panX)), y: (height - cropHeight) / 2 * (1 + clamp(transform.panY)), width: cropWidth, height: cropHeight };
}

export function orientedDimensions(width: number, height: number, transform: PhotoTransform) {
 const quarterTurn = ((transform.rotation ?? 0) % 180 + 180) % 180 === 90;
 return quarterTurn ? { width: height, height: width } : { width, height };
}
