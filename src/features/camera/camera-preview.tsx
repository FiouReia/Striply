"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
export const CameraPreview = forwardRef<HTMLVideoElement, { stream: MediaStream | null; mirrored: boolean }>(function CameraPreview({ stream, mirrored }, ref) {
 const video = useRef<HTMLVideoElement>(null); useImperativeHandle(ref, () => video.current!);
 useEffect(() => { const element = video.current; if (!element) return; element.srcObject = stream; if (stream) void element.play().catch(() => {}); return () => { element.srcObject = null; }; }, [stream]);
 return <video ref={video} className={mirrored ? "mirrored" : ""} autoPlay muted playsInline aria-label="Live camera preview" />;
});
