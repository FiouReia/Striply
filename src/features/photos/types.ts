import type { PhotoEffects } from "./effects";
export interface PhotoTransform { zoom: number; panX: number; panY: number; rotation?: number; flipX?: boolean; flipY?: boolean }
export interface Photo { id: string; file: File; url: string; width: number; height: number; preview: ImageBitmap | HTMLImageElement; transform: PhotoTransform; effects: PhotoEffects }
export const defaultTransform = (): PhotoTransform => ({ zoom: 1, panX: 0, panY: 0, rotation: 0, flipX: false, flipY: false });
