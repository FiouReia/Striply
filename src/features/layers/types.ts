export interface LayerBounds { id: string; x: number; y: number; width: number; height: number; rotation: number; visible: boolean }
export interface PhotoLayer extends LayerBounds { type: "photo"; photoId: string }
export interface TextLayer extends LayerBounds { type: "text"; text: string; font: "serif" | "sans" | "mono" | "script"; fontSize: number; weight: "normal" | "bold"; align: "left" | "center" | "right"; color: string }
export interface StickerLayer extends LayerBounds { type: "sticker"; stickerId: string }
export interface OverlayLayer extends LayerBounds { type: "overlay"; color: string; opacity: number }
export type Layer = PhotoLayer | TextLayer | StickerLayer | OverlayLayer;
export type EditableLayer = TextLayer | StickerLayer | OverlayLayer;
export const fonts = { serif: "Georgia, serif", sans: "Arial, sans-serif", mono: "'Courier New', monospace", script: "'Brush Script MT', cursive" };
