import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { CloudError } from "@/features/cloud/types";
export const MAX_UPLOAD = 20 * 1024 * 1024;
export function newToken() {
  return randomBytes(32).toString("hex");
}
export function tokenHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new CloudError("This link is unavailable or expired.", 404);
  return createHash("sha256").update(token).digest("hex");
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new CloudError("Invalid resource.", 400);
  return value;
}
export function shortText(value: unknown, max = 80) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new CloudError("Enter a valid name.", 400);
  return value.trim();
}
export async function validateImage(bytes: Buffer, declaredType: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD)
    throw new CloudError("Choose an image up to 20 MB.", 413);
  const image = sharp(bytes, {
    limitInputPixels: 40000000,
    failOn: "warning",
    animated: false,
  });
  try {
    const metadata = await image.metadata(),
      mime = (
        { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<
          string,
          string
        >
      )[metadata.format ?? ""];
    if (
      !mime ||
      mime !== declaredType ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 40000000 ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error();
    // Force decoding, so a valid header cannot conceal a truncated/invalid image.
    await image.stats();
    return { mime, width: metadata.width, height: metadata.height };
  } catch {
    throw new CloudError(
      "Choose a valid JPEG, PNG or WebP image under 40 megapixels.",
      400,
    );
  }
}
export async function boundedBody(request: Request, limit: number) {
  const length = Number(request.headers.get("content-length"));
  if (length > limit) throw new CloudError("Upload is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new CloudError("Upload is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function readJson(request: Request) {
  const bytes = await boundedBody(request, 256 * 1024);
  try {
    const value = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new CloudError("Invalid request.", 400);
  }
}
export async function readImageForm(request: Request) {
  const bytes = await boundedBody(request, MAX_UPLOAD + 65536);
  const form = await new Response(bytes, {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new CloudError("Choose a photo.", 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  return { form, buffer, image: await validateImage(buffer, file.type) };
}
