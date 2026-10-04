"use client";
/* Original image thumbnails intentionally use blob-backed native img elements. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { RangeField } from "@/components/range-field";
import { loadPhoto, releasePhoto } from "../photos/load";
import { defaultTransform, type Photo, type PhotoTransform } from "../photos/types";
import { templates, type StripSettings } from "../templates/templates";
import type { PrintFormat } from "../collage/layout";
import { exportCollage, downloadBlob } from "../export/export";
import { openPrintWindow, printBlob } from "../print/print";
import { StripPreview } from "./strip-preview";
import { PhotoEffectsPanel } from "./photo-effects-panel";
import { defaultEffects, type PhotoEffects } from "../photos/effects";
const steps = ["Add photos", "Edit photos", "Customize", "Preview"];
export function StripEditor() {
 const [photos, setPhotos] = useState<(Photo | null)[]>([null, null, null, null]);
 const photosRef = useRef(photos); const mounted = useRef(true); const importing = useRef(false);
 const [settings, setSettings] = useState<StripSettings>({ ...templates[0].settings });
 const [template, setTemplate] = useState("classic"); const [selected, setSelected] = useState(0);
 const [step, setStep] = useState(0); const [started, setStarted] = useState(false);
 const [format, setFormat] = useState<PrintFormat>("strip"); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
 const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [dark, setDark] = useState(false); const [dragOver, setDragOver] = useState(false);
 const input = useRef<HTMLInputElement>(null); const targetSlot = useRef<number | null>(null); const dragSlot = useRef<number | null>(null);
 const count = photos.filter(Boolean).length; const active = photos[selected];
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; photosRef.current.forEach(photo => { if (photo) releasePhoto(photo); }); }; }, []);
 function updatePhotos(next: (Photo | null)[]) { photosRef.current = next; setPhotos(next); }
 function customize<K extends keyof StripSettings>(key: K, value: StripSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })); }
 function transform(value: PhotoTransform, index = selected) { if (importing.current) return; const next = [...photosRef.current]; const photo = next[index]; if (photo) { next[index] = { ...photo, transform: value }; updatePhotos(next); } }
 function resetPhoto() {
  if (importing.current) return;
  const next = [...photosRef.current]; const photo = next[selected];
  if (photo) { next[selected] = { ...photo, transform: defaultTransform(), effects: defaultEffects() }; updatePhotos(next); }
 }
 function updateEffects(effects: PhotoEffects) {
  if (importing.current) return;
  const next = [...photosRef.current]; const photo = next[selected];
  if (photo) { next[selected] = { ...photo, effects }; updatePhotos(next); }
 }
 async function addFiles(files: File[], target: number | null = null) {
  if (importing.current || !files.length) return; importing.current = true; setLoading(true); setError(""); setMessage(""); setStarted(true);
  const next = [...photosRef.current]; const available = target !== null ? [target] : next.flatMap((p, i) => p ? [] : [i]);
  const errors: string[] = []; let added = 0;
  if (files.length > available.length) errors.push(`There is room for ${available.length} photo${available.length === 1 ? "" : "s"}. Extra files were skipped.`);
  for (let index = 0; index < Math.min(files.length, available.length); index++) {
   try {
    const photo = await loadPhoto(files[index]); if (!mounted.current) { releasePhoto(photo); break; }
    const slot = available[index]; if (next[slot]) releasePhoto(next[slot]!); next[slot] = photo; added++;
   } catch (failure) { errors.push(`${files[index].name}: ${failure instanceof Error ? failure.message : "Could not load photo."}`); }
  }
  if (mounted.current) { updatePhotos(next); setError(errors.join(" ")); setMessage(added ? `${added} photo${added === 1 ? "" : "s"} added. Your photos stay on this device.` : ""); setLoading(false); }
  importing.current = false;
 }
 function chooseFile(slot: number | null) { targetSlot.current = slot; if (input.current) { input.current.multiple = slot === null; input.current.click(); } }
 function removePhoto(index: number) { const next = [...photosRef.current]; if (next[index]) releasePhoto(next[index]!); next[index] = null; updatePhotos(next); }
 function movePhoto(from: number, to: number) { if (to < 0 || to > 3 || from === to) return; const next = [...photosRef.current]; [next[from], next[to]] = [next[to], next[from]]; updatePhotos(next); setSelected(to); setMessage(`Photo moved to slot ${to + 1}.`); }
 async function output(print = false) {
  if (count !== 4 || busy || loading) return; setBusy(true); setError(""); let win: Window | null = null;
  try { if (print) win = openPrintWindow(format); const blob = await exportCollage(photos.filter((photo): photo is Photo => photo !== null), settings, { format, mimeType: "image/png" }); if (print && win) await printBlob(win, blob); else downloadBlob(blob, format); setMessage(print ? "Print preview opened." : "Your print-ready PNG is downloaded."); }
  catch (failure) { win?.close(); setError(failure instanceof Error ? failure.message : "Could not prepare your image. Try again."); }
  finally { setBusy(false); }
 }
 function selectStep(next: number) { setStarted(true); setStep(next); }
 const photoPanel = <section className="panel photos-panel" aria-label="Your photos">
  <div className="section-heading"><div><span className="eyebrow">THE CAST</span><h2>Your photos <span className="count">{count}/4</span></h2></div><button className="text-button" disabled={loading || count === 4} onClick={() => chooseFile(null)}>+ Add</button></div>
  <p className="muted small">Four moments. In your favorite order.</p>
  <div className="photo-list">{photos.map((photo, index) => <div key={photo?.id ?? index} className={`photo-row ${selected === index ? "active" : ""}`} draggable={!!photo && !loading} onDragStart={event => { dragSlot.current = index; event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragSlot.current = null; }} onDragOver={event => { if (dragSlot.current !== null) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragSlot.current !== null) { movePhoto(dragSlot.current, index); dragSlot.current = null; } }}>
   <span className="photo-number">0{index + 1}</span><button className="thumbnail" aria-label={photo ? `Select photo ${index + 1}` : `Add photo ${index + 1}`} disabled={loading} onClick={() => { setSelected(index); if (!photo) chooseFile(index); else selectStep(1); }}>{photo ? <img src={photo.url} alt="" /> : <span>+</span>}</button>
   <div className="photo-row-info"><button className="photo-label" onClick={() => { setSelected(index); if (photo) selectStep(1); }}><strong>{photo ? `Photo ${index + 1}` : "Your next moment"}</strong></button><span className="muted small">{photo ? "Drag to reorder" : "Choose a photo"}</span>{photo && <div className="row-tools"><button aria-label={`Move photo ${index + 1} up`} disabled={index === 0 || loading} onClick={() => movePhoto(index, index - 1)}>↑</button><button aria-label={`Move photo ${index + 1} down`} disabled={index === 3 || loading} onClick={() => movePhoto(index, index + 1)}>↓</button><button aria-label={`Replace photo ${index + 1}`} disabled={loading} onClick={() => chooseFile(index)}>Replace</button><button aria-label={`Remove photo ${index + 1}`} disabled={loading} onClick={() => removePhoto(index)}>×</button></div>}</div>
  </div>)}</div>
  <button className={`drop-zone ${dragOver ? "drag-over" : ""}`} disabled={loading || count === 4} onClick={() => chooseFile(null)} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragOver(true); } }} onDragLeave={() => setDragOver(false)} onDrop={event => { event.preventDefault(); setDragOver(false); void addFiles(Array.from(event.dataTransfer.files)); }}><span className="upload-symbol">↥</span><strong>{loading ? "Opening your photos…" : count === 4 ? "All four moments, ready" : "Drop your photos here"}</strong><span>or browse files · JPG, PNG, WebP</span><span className="small">Up to 20 MB each</span></button>
  <div className="privacy-note"><span>◈</span> Just between you and your browser.<br />Your photos are never uploaded.</div>
 </section>;
 const templatePanel = <section className="panel template-panel" aria-label="Strip designs"><span className="eyebrow">SET THE MOOD</span><h2>Choose a design</h2><div className="template-list">{templates.map(item => <button key={item.id} className={`template-card ${template === item.id ? "active" : ""}`} aria-pressed={template === item.id} onClick={() => { setTemplate(item.id); setSettings(previous => ({ ...item.settings, title: previous.title === templates.find(t => t.id === template)?.settings.title ? item.settings.title : previous.title, date: previous.date, footer: previous.footer, showFooter: previous.showFooter })); }}><span className="mini-strip" style={{ background: item.settings.background }}><i /><i /><i /><i /></span><span><strong>{item.name}</strong><span className="muted small">{item.note}</span></span><span className="template-check">{template === item.id ? "✓" : ""}</span></button>)}</div></section>;
 const cropPanel = <section className="panel crop-panel"><span className="eyebrow">MAKE IT YOURS</span><h2>Edit photo {selected + 1}</h2><p className="muted small">Drag a photo in the strip to reposition it. Use arrow keys or the sliders for fine adjustments.</p><div className="photo-tabs" aria-label="Select photo">{photos.map((photo, index) => <button key={index} className={selected === index ? "active" : ""} onClick={() => setSelected(index)} aria-pressed={selected === index}>{index + 1}{!photo && <span className="sr-only"> empty</span>}</button>)}</div>{active ? <><RangeField label="Zoom" value={active.transform.zoom} min={1} max={3} step={0.01} suffix="×" onChange={value => transform({ ...active.transform, zoom: value })} /><RangeField label="Horizontal position" value={active.transform.panX} min={-1} max={1} step={0.01} onChange={value => transform({ ...active.transform, panX: value })} /><RangeField label="Vertical position" value={active.transform.panY} min={-1} max={1} step={0.01} onChange={value => transform({ ...active.transform, panY: value })} /><PhotoEffectsPanel effects={active.effects} onChange={updateEffects} /><button className="secondary full" onClick={resetPhoto} >↺ Reset photo</button><span className="quality-note">Original: {active.width} × {active.height} px</span>{(active.width < 528 || active.height < 400) && <p className="small">This photo may look soft when printed.</p>}</> : <button className="secondary full" onClick={() => chooseFile(selected)}>Add photo {selected + 1}</button>}</section>;
 const stylePanel = <section className="panel style-panel"><span className="eyebrow">THE LITTLE DETAILS</span><h2>Customize your strip</h2><label className="color-field"><span>Background</span><span><input type="color" aria-label="Background color" value={settings.background} onChange={event => customize("background", event.target.value)} /><code>{settings.background.toUpperCase()}</code></span></label><label className="color-field"><span>Text & border</span><input type="color" aria-label="Text and border color" value={settings.foreground} onChange={event => customize("foreground", event.target.value)} /></label><RangeField label="Photo spacing" min={8} max={40} value={settings.spacing} onChange={value => customize("spacing", value)} /><RangeField label="Rounded corners" min={0} max={40} value={settings.radius} onChange={value => customize("radius", value)} /><label className="check-field"><span>Photo border</span><input type="checkbox" checked={settings.border} onChange={event => customize("border", event.target.checked)} /></label><label className="check-field"><span>Include a footer</span><input type="checkbox" checked={settings.showFooter} onChange={event => customize("showFooter", event.target.checked)} /></label>{settings.showFooter && <div className="footer-fields"><label>Strip title<input maxLength={45} value={settings.title} onChange={event => customize("title", event.target.value)} placeholder="Give this moment a name" /></label><label>Date<input type="date" value={settings.date} onChange={event => customize("date", event.target.value)} /></label><label>A little message<input maxLength={60} value={settings.footer} onChange={event => customize("footer", event.target.value)} /></label></div>}</section>;
 return <div className={`app ${dark ? "dark" : ""}`}>
  <a className="skip-link" href="#workspace">Skip to editor</a><header className="topbar"><Link href="/" className="brand"><span className="brand-mark"><i /><i /><i /></span>{brand.name}<span className="brand-dot">®</span></Link><div className="topbar-right"><span className="local-badge"><i />100% on your device</span><button className="theme-toggle" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setDark(!dark)}>{dark ? "☀" : "☾"}</button></div></header>
  <main id="workspace"><div className="intro"><div><span className="eyebrow">A LITTLE STRIP. A LOT OF MEMORIES.</span><h1>Your moments,<br className="mobile-break" /> all together<span className="accent">.</span></h1><p>Pick four photos. Make them yours. Keep them forever.</p></div>{!started && <button className="primary create-button" onClick={() => { setStarted(true); chooseFile(null); }}>Create Photo Strip <span>↗</span></button>}</div>
  <nav className="steps" aria-label="Editor steps">{steps.map((label, index) => <button key={label} className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined} onClick={() => selectStep(index)}><span>{index === 0 && count === 4 ? "✓" : `0${index + 1}`}</span>{label}<span className="step-arrow">→</span></button>)}</nav>
  <input className="sr-only" ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose photos" multiple onChange={event => { const files = Array.from(event.target.files ?? []); const target = targetSlot.current; event.target.value = ""; void addFiles(files, target); }} />
  <div className="status-area">{error && <p className="error" role="alert" aria-label="Photo error">{error}</p>}<p className="status" role="status" aria-label="Editor status">{message || (loading ? "Opening your photos…" : "")}</p></div>
  <div className={`workspace step-${step}`}><aside className="left-column">{photoPanel}{templatePanel}</aside><section className="preview-column" aria-label="Live strip preview"><div className="preview-toolbar"><span className="eyebrow">{step === 3 ? "READY FOR THE FRIDGE" : "YOUR LITTLE KEEPSAKE"}</span><span className="preview-status"><i />Live preview</span></div><div className="preview-stage"><div className="paper-label">made of good moments</div><StripPreview photos={photos} settings={settings} format={format} selected={selected} editable={step !== 3} onSelect={index => { setSelected(index); if (photos[index]) selectStep(1); else chooseFile(index); }} onTransform={(index, value) => transform(value, index)} /><div className="preview-caption">{format === "sheet" ? "4 × 6 IN · TWO IDENTICAL STRIPS" : "2 × 6 IN · ONE PERFECT LITTLE STRIP"}</div></div><div className="format-toggle" aria-label="Print format"><button aria-pressed={format === "strip"} className={format === "strip" ? "active" : ""} onClick={() => setFormat("strip")}>Single 2×6 Strip</button><button aria-pressed={format === "sheet"} className={format === "sheet" ? "active" : ""} onClick={() => setFormat("sheet")}>4×6 Print Sheet</button></div><p className="preview-help">{step === 3 ? "Your preview matches the final print layout." : "Click a photo to edit · drag to find its best angle"}</p></section><aside className="right-column">{cropPanel}{stylePanel}</aside></div>
  <div className="action-bar"><div><strong>{count === 4 ? "A keepsake, ready when you are." : "Every good strip starts with four photos."}</strong><span>{format === "sheet" ? "1200 × 1800 px" : "600 × 1800 px"} · 300 DPI target · PNG</span></div><div className="action-buttons">{step > 0 && <button className="secondary mobile-action" onClick={() => selectStep(step - 1)}>Back</button>}{step < 3 && <button className="secondary next-step" disabled={count !== 4} onClick={() => selectStep(step + 1)}>{steps[step + 1]} →</button>}<button className="secondary" disabled={count !== 4 || busy || loading} onClick={() => void output(true)}>Print <span>↗</span></button><button className="primary" disabled={count !== 4 || busy || loading} onClick={() => void output()}>{busy ? "Preparing…" : "Download PNG"}<span>↓</span></button></div></div>
  <p className="print-note">For printing: choose {format === "sheet" ? "4×6" : "2×6"} inch paper, 100% scale, no margins, and turn off headers and footers. Your printer may add non-printable edges.</p>
  </main><footer className="site-footer"><span>{brand.name} — {brand.description}</span><span>Made to be kept.</span></footer>
 </div>;
}
