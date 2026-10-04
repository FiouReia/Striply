"use client";
import { useEffect, useState } from "react";
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
export function PwaControls() {
 const [install, setInstall] = useState<InstallPrompt | null>(null), [fullscreen, setFullscreen] = useState(false), [message, setMessage] = useState("");
 useEffect(() => {
  const offered = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
  const changed = () => setFullscreen(!!document.fullscreenElement);
  window.addEventListener("beforeinstallprompt", offered); document.addEventListener("fullscreenchange", changed);
  if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
   void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async registration => { await navigator.serviceWorker.ready; setMessage(registration.waiting ? "An update is ready. Finish your project, then close all Striply windows to update." : "Ready to use offline"); }).catch(() => setMessage("Offline setup failed. Reconnect and reload to retry."));
  }
  return () => { window.removeEventListener("beforeinstallprompt", offered); document.removeEventListener("fullscreenchange", changed); };
 }, []);
 async function toggleFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else { const app = document.querySelector<HTMLElement>(".app"); if (!app?.requestFullscreen) throw new Error(); await app.requestFullscreen(); } }
  catch { setMessage("Fullscreen is unavailable here. Use your browser's fullscreen control instead."); }
 }
 return <div className="pwa-controls"><button className="secondary" onClick={() => void toggleFullscreen()}>{fullscreen ? "Exit Full Screen" : "Full Screen"}</button><button className="secondary" onClick={async () => { if (install) { await install.prompt(); await install.userChoice; setInstall(null); } else setMessage("To install: use your browser's Install app or Add to Home Screen option. Installation requires HTTPS or localhost."); }}>Install app</button>{message && <span role="status" className="pwa-status">{message}</span>}</div>;
}
