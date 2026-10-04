"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { useCamera } from "./use-camera";
import { CameraPreview } from "./camera-preview";
import { capturePhoto } from "./service";
import { defaultBoothConfiguration, runBoothSession, type BoothProgress } from "./session";
export function PhotoBooth({ mode, onClose, onContinue }: { mode: "single" | "booth"; onClose: () => void; onContinue: (files: File[]) => Promise<void> }) {
 const camera = useCamera(); const startCamera = camera.start; const video = useRef<HTMLVideoElement>(null); const abort = useRef<AbortController | null>(null); const alive = useRef(true); const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 const [running, setRunning] = useState(false), [progress, setProgress] = useState<BoothProgress | null>(null), [flash, setFlash] = useState(false), [message, setMessage] = useState(""), [config, setConfig] = useState(defaultBoothConfiguration), [mirrored, setMirrored] = useState(true), [facing, setFacing] = useState<"user" | "environment">("user"), [device, setDevice] = useState("");
 const [shots, setShots] = useState<{ file: File; url: string }[]>([]); const shotsRef = useRef(shots); const dialog = useRef<HTMLDivElement>(null);
 useEffect(() => { alive.current = true; const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; dialog.current?.focus(); void startCamera(); return () => { alive.current = false; abort.current?.abort(); if (flashTimer.current) clearTimeout(flashTimer.current); shotsRef.current.forEach(shot => URL.revokeObjectURL(shot.url)); document.body.style.overflow = overflow; previous?.focus(); }; }, [startCamera]);
 function review(files: File[]) { shotsRef.current.forEach(shot => URL.revokeObjectURL(shot.url)); const next = files.map(file => ({ file, url: URL.createObjectURL(file) })); shotsRef.current = next; setShots(next); }
 async function shoot() {
  const file = await capturePhoto(video.current!); if (alive.current) { setFlash(true); if (flashTimer.current) clearTimeout(flashTimer.current); flashTimer.current = setTimeout(() => { if (alive.current) setFlash(false); }, 160); } return file;
 }
 async function startSession() {
  setRunning(true); setMessage(""); const controller = new AbortController(); abort.current = controller;
  try { const files = mode === "single" ? [await shoot()] : await runBoothSession(config, shoot, setProgress, controller.signal); if (alive.current && !controller.signal.aborted) review(files); }
  catch (error) { if (alive.current && !(error instanceof Error && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Capture failed. Retry."); }
  finally { if (alive.current) { setRunning(false); setProgress(null); } }
 }
 async function retake(index: number) {
  setRunning(true); setMessage(""); const controller = new AbortController(); abort.current = controller;
  try { const file = await shoot(); if (!alive.current || controller.signal.aborted) return; const next = [...shotsRef.current]; URL.revokeObjectURL(next[index].url); next[index] = { file, url: URL.createObjectURL(file) }; shotsRef.current = next; setShots(next); }
  catch (error) { if (alive.current) setMessage(error instanceof Error ? error.message : "Retake failed. Retry."); }
  finally { if (alive.current) setRunning(false); }
 }
 function cancel() { abort.current?.abort(); setProgress(null); }
 function close() { cancel(); camera.stop(); onClose(); }
 const label = progress ? `Photo ${progress.shot} of ${config.photoCount}` : shots.length ? "Your moments, captured" : mode === "booth" ? "Four shots. Make them count." : "Find your best angle.";
 return <div className="booth-backdrop" role="dialog" aria-modal="true" aria-labelledby="booth-title" ref={dialog} tabIndex={-1} onKeyDown={event => {
  if (event.key === "Escape") { event.stopPropagation(); close(); }
  if (event.key === "Tab") { const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')).filter(element => element.offsetParent !== null); const first = controls[0], last = controls.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
 }}><section className="booth-surface"><header><div><span className="eyebrow">{mode === "booth" ? "PHOTO BOOTH" : "CAMERA"}</span><h2 id="booth-title">{label}</h2></div><button className="secondary" onClick={close}>Close camera</button></header>
  <div className={`camera-stage ${flash ? "capture-flash" : ""}`}><CameraPreview ref={video} stream={camera.stream} mirrored={mirrored} />{camera.status === "starting" && <p>Opening camera...</p>}{progress?.phase === "countdown" && <span key={progress.remaining} className="countdown" aria-hidden="true">{progress.remaining}</span>}<div className="booth-progress" role="status">{progress ? `${label} - ${progress.phase === "countdown" ? progress.remaining : progress.phase === "pause" ? "Get ready..." : "Captured!"}` : ""}</div></div>
  {(camera.error || message) && <p className="error" role="alert">{camera.error || message}</p>}
  <div className="camera-options"><label>Camera<select value={device} disabled={running} onChange={event => { setDevice(event.target.value); void camera.start({ deviceId: event.target.value || undefined, facingMode: facing }); }}><option value="">Default camera</option>{camera.devices.map((device, index) => <option value={device.deviceId} key={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label><button className="secondary" disabled={running} onClick={() => { const next = facing === "user" ? "environment" : "user"; setFacing(next); setDevice(""); setMirrored(next === "user"); void camera.start({ facingMode: next }); }}>Switch Camera</button><label className="check-field">Mirror preview<input type="checkbox" checked={mirrored} onChange={event => setMirrored(event.target.checked)} /></label></div>
  {mode === "booth" && !shots.length && <details className="booth-settings"><summary>Session timing</summary><label>Countdown seconds<input aria-label="Countdown seconds" type="number" min={1} max={10} value={config.countdown} disabled={running} onChange={event => setConfig({ ...config, countdown: Number(event.target.value) })} /></label><label>Pause between shots<input type="number" min={0} max={10} step={0.5} value={config.delay} disabled={running} onChange={event => setConfig({ ...config, delay: Number(event.target.value) })} /></label><label>Number of photos<select value={config.photoCount} disabled><option value={4}>4 photos (V2)</option></select></label></details>}
  {!!shots.length && <div className="shot-review">{shots.map((shot, index) => <div key={shot.url}><img src={shot.url} alt={`Captured photo ${index + 1}`} /><button className="secondary" disabled={running || camera.status !== "ready"} onClick={() => void retake(index)}>Retake photo {index + 1}</button></div>)}</div>}
  <div className="booth-actions">{camera.status === "error" && <button className="secondary" onClick={() => void camera.start({ deviceId: device || undefined, facingMode: facing })}>Retry camera</button>}{running ? <button className="secondary" onClick={cancel}>Cancel session</button> : !shots.length ? <button className="primary" disabled={camera.status !== "ready"} onClick={() => void startSession()}>{mode === "booth" ? "Start Session" : "Capture photo"}</button> : <><button className="secondary" onClick={() => review([])}>Retake all</button><button className="primary" onClick={async () => { setRunning(true); try { await onContinue(shots.map(shot => shot.file)); } catch { setMessage("These photos could not be added. Retry."); } finally { if (alive.current) setRunning(false); } }}>Continue to editor</button></>}</div>
  <p className="muted small">Captured photos are not mirrored. {mode === "booth" ? "Continuing replaces your current four photos." : "Your photo will be added to the editor."}</p>
 </section></div>;
}
