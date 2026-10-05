import { defaultTransform, type Photo, type PhotoTransform } from "../photos/types";
import { defaultEffects, effectPresets, type PhotoEffects } from "../photos/effects";
import { templates, type StripSettings } from "../templates/templates";
import type { EditableLayer } from "../layers/types";
import { layouts } from "../collage/layout";
export interface ProjectPhoto { id: string; width: number; height: number; transform: PhotoTransform; effects: PhotoEffects }
export interface StriplyProject { id: string; version: 2; createdAt: string; updatedAt: string; layoutId: string; templateId: string; photos: (ProjectPhoto | null)[]; layers: EditableLayer[]; settings: StripSettings; event?: { id: string; allowCustomization: boolean; logoPhoto?: ProjectPhoto } }
export function newProject(): StriplyProject {
 const now = new Date().toISOString();
 return { id: crypto.randomUUID(), version: 2, createdAt: now, updatedAt: now, layoutId: "classic", templateId: "classic", photos: [null, null, null, null], layers: [], settings: { ...templates[0].settings } };
}
export function photoMetadata(photo: Photo): ProjectPhoto { return { id: photo.id, width: photo.width, height: photo.height, transform: { ...photo.transform }, effects: { ...photo.effects } }; }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const color = (value: unknown) => typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
export function migrateProject(value: unknown): StriplyProject {
 if (!record(value)) throw new Error("The saved project could not be read. Your saved data has been kept.");
 if (value.version !== 1 && value.version !== 2) throw new Error("This saved project uses an unsupported version. Your saved data has been kept.");
 const p = structuredClone(value);
 if (p.version === 1) {
  p.version = 2; p.layoutId ??= "classic"; p.layers ??= []; p.templateId ??= "classic";
  if (Array.isArray(p.photos)) p.photos = p.photos.map(photo => record(photo) ? { ...photo, transform: { ...defaultTransform(), ...(record(photo.transform) ? photo.transform : {}) }, effects: { ...defaultEffects(), ...(record(photo.effects) ? photo.effects : {}) } } : photo);
 }
 if (typeof p.id !== "string" || typeof p.createdAt !== "string" || typeof p.updatedAt !== "string" || !layouts.some(l => l.id === p.layoutId) || !templates.some(t => t.id === p.templateId) || !Array.isArray(p.photos) || p.photos.length !== 4 || !Array.isArray(p.layers) || p.layers.length > 20 || !record(p.settings)) throw new Error("The saved project is incomplete. Your saved data has been kept.");
 const ids = new Set<string>();
 if(p.event !== undefined && (!record(p.event) || typeof p.event.id !== "string" || !/^[a-f0-9-]{36}$/i.test(p.event.id) || typeof p.event.allowCustomization !== "boolean")) throw new Error("Saved event settings are invalid. Your saved data has been kept.");
 for (const photo of [...p.photos, ...(record(p.event) && p.event.logoPhoto ? [p.event.logoPhoto] : [])]) {
  if (photo === null) continue;
  if (!record(photo) || typeof photo.id !== "string" || ids.has(photo.id) || !finite(photo.width, 1, 40000000) || !finite(photo.height, 1, 40000000) || photo.width * photo.height > 40000000 || !record(photo.transform) || !record(photo.effects)) throw new Error("A saved photo is invalid. Your saved data has been kept.");
  ids.add(photo.id); const t = photo.transform, e = photo.effects;
  if (!finite(t.zoom, 1, 3) || !finite(t.panX, -1, 1) || !finite(t.panY, -1, 1) || ![0,90,180,270].includes(Number(t.rotation ?? 0)) || typeof (t.flipX ?? false) !== "boolean" || typeof (t.flipY ?? false) !== "boolean" || !effectPresets.some(f => f.id === e.preset) || !finite(e.brightness, 0, 200) || !finite(e.contrast, 0, 200) || !finite(e.saturation, 0, 200) || !finite(e.grayscale ?? 0, 0, 100) || !finite(e.sepia ?? 0, 0, 100)) throw new Error("Saved photo edits are invalid. Your saved data has been kept.");
 }
 const s = p.settings;
 if (s.font !== undefined && !["serif", "sans", "mono", "script"].includes(String(s.font))) throw new Error("The saved font is unavailable. Your saved data has been kept.");
 if (!color(s.background) || !color(s.foreground) || !finite(s.spacing, 8, 40) || !finite(s.radius, 0, 40) || typeof s.border !== "boolean" || typeof s.showFooter !== "boolean" || typeof s.title !== "string" || s.title.length > 45 || typeof s.date !== "string" || s.date.length > 20 || typeof s.footer !== "string" || s.footer.length > 60) throw new Error("Saved styling is invalid. Your saved data has been kept.");
 for (const layer of p.layers) {
  if (!record(layer) || typeof layer.id !== "string" || ids.has(layer.id) || !["text", "sticker", "overlay"].includes(String(layer.type)) || !finite(layer.x, 0, 1200) || !finite(layer.y, 0, 1800) || !finite(layer.width, 20, 1200) || !finite(layer.height, 20, 1800) || !finite(layer.rotation, -180, 180) || typeof layer.visible !== "boolean") throw new Error("A saved layer is invalid. Your saved data has been kept.");
  ids.add(layer.id);
  if (layer.type === "text" && (typeof layer.text !== "string" || layer.text.length > 100 || !["serif","sans","mono","script"].includes(String(layer.font)) || !finite(layer.fontSize, 12, 120) || !["normal","bold"].includes(String(layer.weight)) || !["left","center","right"].includes(String(layer.align)) || !color(layer.color))) throw new Error("Saved text is invalid. Your saved data has been kept.");
  if (layer.type === "sticker" && !["heart","star","party","wedding","birthday","graduation","flower"].includes(String(layer.stickerId))) throw new Error("The saved sticker is unavailable. Your saved data has been kept.");
  if (layer.type === "overlay" && (!color(layer.color) || !finite(layer.opacity, 0, 1))) throw new Error("Saved overlay is invalid. Your saved data has been kept.");
 }
 return p as unknown as StriplyProject;
}
