"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { acquireCamera, cameraError, listCameras, stopCamera, type CameraChoice } from "./service";
export function useCamera() {
 const [stream, setStream] = useState<MediaStream | null>(null), [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [error, setError] = useState(""), [status, setStatus] = useState<"idle" | "starting" | "ready" | "error">("idle");
 const active = useRef<MediaStream | null>(null), request = useRef(0);
 const stop = useCallback(() => { request.current++; stopCamera(active.current); active.current = null; setStream(null); setStatus("idle"); }, []);
 const start = useCallback(async (choice: CameraChoice = {}) => {
  const generation = ++request.current; stopCamera(active.current); active.current = null; setStream(null); setError(""); setStatus("starting");
  try {
   const next = await acquireCamera(choice); if (generation !== request.current) { stopCamera(next); return; }
   active.current = next; setStream(next); setStatus("ready");
   void listCameras().then(devices => { if (generation === request.current) setDevices(devices); }).catch(() => {});
   next.getVideoTracks().forEach(track => track.addEventListener("ended", () => { if (generation === request.current) { setError("Camera disconnected. Reconnect it and retry."); setStatus("error"); } }, { once: true }));
  } catch (failure) { if (generation === request.current) { setError(cameraError(failure)); setStatus("error"); } }
 }, []);
 useEffect(() => () => { request.current++; stopCamera(active.current); active.current = null; }, []);
 return { stream, devices, status, error, start, stop };
}
