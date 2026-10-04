import type { PhotoTransform } from "../photos/types";
import { orientedDimensions, type Rect } from "./layout";
export function drawOrientedPhoto(ctx: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, crop: Rect, target: Rect, transform: PhotoTransform) {
 if (!(transform.rotation ?? 0) && !transform.flipX && !transform.flipY) { ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, target.x, target.y, target.width, target.height); return; }
 const oriented = orientedDimensions(width, height, transform);
 ctx.save(); ctx.translate(target.x, target.y); ctx.scale(target.width / crop.width, target.height / crop.height); ctx.translate(-crop.x, -crop.y);
 ctx.translate(oriented.width / 2, oriented.height / 2); ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
 ctx.rotate((transform.rotation ?? 0) * Math.PI / 180); ctx.drawImage(source, -width / 2, -height / 2, width, height); ctx.restore();
}
