export interface CameraChoice { deviceId?: string; facingMode?: "user" | "environment" }
export function cameraError(error: unknown): string {
 const name = error instanceof Error ? error.name : "";
 if (name === "NotAllowedError" || name === "SecurityError") return "Camera access was denied. Allow camera permission in your browser, then retry.";
 if (name === "NotFoundError" || name === "OverconstrainedError") return "That camera is unavailable. Choose another camera or retry.";
 if (name === "NotReadableError" || name === "AbortError") return "The camera is busy. Close other apps using it, then retry.";
 return error instanceof Error && error.message.startsWith("Camera") ? error.message : "The camera could not start. Retry or upload photos instead.";
}
export function stopCamera(stream: MediaStream | null) { stream?.getTracks().forEach(track => track.stop()); }
export async function acquireCamera(choice: CameraChoice = {}): Promise<MediaStream> {
 if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture needs HTTPS or localhost and a browser with camera support.");
 return navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1920 }, height: { ideal: 1080 }, ...(choice.deviceId ? { deviceId: { exact: choice.deviceId } } : { facingMode: { ideal: choice.facingMode ?? "user" } }) } });
}
export async function listCameras(): Promise<MediaDeviceInfo[]> { return (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput"); }
export async function capturePhoto(video: HTMLVideoElement): Promise<File> {
 if (!video.videoWidth || !video.videoHeight || video.readyState < 2) throw new Error("Camera preview is not ready. Wait a moment and retry.");
 const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
 try {
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Camera capture is unavailable. Try uploading photos.");
  ctx.drawImage(video, 0, 0); // Preview mirroring intentionally does not affect captured pixels.
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Camera capture failed. Retry.")), "image/jpeg", 0.96));
  return new File([blob], `striply-camera-${Date.now()}.jpg`, { type: "image/jpeg" });
 } finally { canvas.width = 0; canvas.height = 0; }
}
