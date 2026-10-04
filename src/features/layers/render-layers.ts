import { fonts, type EditableLayer } from "./types";
export function renderLayers(ctx: CanvasRenderingContext2D, layers: EditableLayer[], assets: Map<string, HTMLImageElement>) {
 for (const layer of layers) {
  if (!layer.visible) continue;
  ctx.save(); ctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2); ctx.rotate(layer.rotation * Math.PI / 180);
  ctx.beginPath(); ctx.rect(-layer.width / 2, -layer.height / 2, layer.width, layer.height); ctx.clip();
  if (layer.type === "text") {
   ctx.fillStyle = layer.color; ctx.font = `${layer.weight} ${layer.fontSize}px ${fonts[layer.font]}`; ctx.textAlign = layer.align; ctx.textBaseline = "middle";
   const x = layer.align === "left" ? -layer.width / 2 : layer.align === "right" ? layer.width / 2 : 0;
   const lines = layer.text.split("\n").slice(0, 4); lines.forEach((line, i) => ctx.fillText(line, x, (i - (lines.length - 1) / 2) * layer.fontSize * 1.2, layer.width));
  } else if (layer.type === "sticker") {
   const image = assets.get(layer.stickerId); if (image) ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  } else { ctx.globalAlpha = layer.opacity; ctx.fillStyle = layer.color; ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height); }
  ctx.restore();
 }
}
