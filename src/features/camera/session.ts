export interface BoothConfiguration { countdown: number; delay: number; photoCount: number }
export interface BoothProgress { phase: "countdown" | "capture" | "pause"; shot: number; remaining: number }
export const defaultBoothConfiguration: BoothConfiguration = { countdown: 3, delay: 1, photoCount: 4 };
export function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
 return new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException("Session cancelled", "AbortError")); return; }
  const cancel = () => { clearTimeout(timer); reject(new DOMException("Session cancelled", "AbortError")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, milliseconds);
  signal.addEventListener("abort", cancel, { once: true });
 });
}
export async function runBoothSession(config: BoothConfiguration, capture: () => Promise<File>, onProgress: (progress: BoothProgress) => void, signal: AbortSignal): Promise<File[]> {
 if (!Number.isInteger(config.photoCount) || config.photoCount !== 4 || !Number.isInteger(config.countdown) || config.countdown < 1 || config.countdown > 10 || !Number.isFinite(config.delay) || config.delay < 0 || config.delay > 10) throw new Error("Choose a 1-10 second countdown and a 0-10 second pause. V2 sessions take four photos.");
 const files: File[] = [];
 for (let shot = 1; shot <= config.photoCount; shot++) {
  for (let remaining = config.countdown; remaining > 0; remaining--) { onProgress({ phase: "countdown", shot, remaining }); await waitFor(1000, signal); }
  if (signal.aborted) throw new DOMException("Session cancelled", "AbortError");
  onProgress({ phase: "capture", shot, remaining: 0 }); const file = await capture();
  if (signal.aborted) throw new DOMException("Session cancelled", "AbortError"); files.push(file);
  if (shot < config.photoCount) { onProgress({ phase: "pause", shot, remaining: 0 }); await waitFor(config.delay * 1000, signal); }
 }
 return files;
}
