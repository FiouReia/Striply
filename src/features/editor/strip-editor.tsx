"use client";
/* Original image thumbnails intentionally use blob-backed native img elements. */
/* eslint-disable @next/next/no-img-element */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { brand } from "@/config/brand";
import { RangeField } from "@/components/range-field";
import { loadPhoto, releasePhoto } from "../photos/load";
import { defaultTransform, type Photo, type PhotoTransform } from "../photos/types";
import { templates, type StripSettings, type StripTemplate } from "../templates/templates";
import { layouts, getLayout, calculateLayout, exportDimensions, type PrintFormat } from "../collage/layout";
import { LayerPanel } from "../layers/layer-panel";
import type { EditableLayer } from "../layers/types";
import { useAutosave } from "../project/use-autosave";
import { PwaControls } from "../pwa/controls";
import { exportCollage, downloadBlob, outputDimensions } from "../export/export";
import { openPrintWindow, printBlob } from "../print/print";
import { useProject } from "../project/use-project";
import { StripPreview } from "./strip-preview";
import { PhotoEffectsPanel } from "./photo-effects-panel";
import { defaultEffects, type PhotoEffects } from "../photos/effects";
import { newProject, photoMetadata } from "../project/model";
import { serializeProject, hydrateProject } from "../project/persistence";
import { readLocalProject, writeLocalProject } from "../project/library";
import { projectThumbnail } from "../cloud/projects";
import { useCloud } from "../cloud/use-cloud";
import { CloudPanel } from "../cloud/editor-panel";
import { assetBlob, cloudRequest } from "../cloud/api";
import type { Asset, CloudExport, EventRecord } from "../cloud/types";
const PhotoBooth = lazy(() => import("../camera/booth").then(module => ({ default: module.PhotoBooth })));
const steps = ["Add photos", "Edit photos", "Customize", "Preview"];
export function StripEditor() {
 const { store, project, history, photos } = useProject();
 const photosRef = useRef(photos); const mounted = useRef(true); const importing = useRef(false);
 const autosave = useAutosave(store, project);
 const settings = project.settings;
 const definition = getLayout(project.layoutId), layout = calculateLayout(settings, project.layoutId);
 const required = definition.photoCount;
 const [cameraMode, setCameraMode] = useState<"single" | "booth" | null>(null), [selectedLayer, setSelectedLayer] = useState<string | null>(null), [guides, setGuides] = useState(false), [marginGuide, setMarginGuide] = useState(false), [cutGuide, setCutGuide] = useState(false);
 const [mimeType, setMimeType] = useState<"image/png" | "image/jpeg">("image/png"), [resolution, setResolution] = useState<"digital" | "high" | "print">("print"), [jpegQuality, setJpegQuality] = useState(92), [category, setCategory] = useState("All");
 const [format, setFormat] = useState<PrintFormat>("strip");
 const readyPhotos = photos.slice(0, required).every(photo=>!!photo&&!photo.cloudPreview);
 const [event, setEvent] = useState<EventRecord | null>(null);
 const cloudExports = useMemo<CloudExport>(() => ({format, mimeType, resolution, quality:jpegQuality/100, cutGuide}), [format, mimeType, resolution, jpegQuality, cutGuide]);
 const restoreExports = useCallback((value:CloudExport) => {setFormat(value.format);setMimeType(value.mimeType);setResolution(value.resolution);setJpegQuality(value.quality*100);setCutGuide(value.cutGuide);}, [setFormat,setMimeType,setResolution,setJpegQuality,setCutGuide]);
 const cloud = useCloud(store, project, cloudExports, restoreExports, autosave.ready);
 const customizationLocked = project.event?.allowCustomization === false;
 const eventLogo = project.event?.logoPhoto ? store.resources.get(project.event.logoPhoto.id) : undefined;


 function formatForLayout() { return definition.kind === "strip" ? format : "strip"; }
 function selectTheme(item: StripTemplate) {
  const previous = store.getSnapshot().present;
  const settings = { ...item.settings, title: previous.settings.title === templates.find(t => t.id === previous.templateId)?.settings.title ? item.settings.title : previous.settings.title, date: previous.settings.date, footer: previous.settings.footer, showFooter: previous.settings.showFooter };
  const layers = previous.layers.filter(layer => !layer.id.startsWith("theme-"));
  for (const stickerId of item.stickerPresets ?? []) if (layers.length < 20) layers.push({ id: `theme-${crypto.randomUUID()}`, type: "sticker", stickerId, x: layout.width - 180, y: layout.height - 180, width: 120, height: 120, rotation: 0, visible: true });
  store.commit({ templateId: item.id, settings, layers });
 }
 function changeLayout(id: string) {
  const previous = getLayout(project.layoutId), next = getLayout(id);
  const layers = project.layers.map(layer => { const width = Math.max(20, Math.min(next.width, layer.width / previous.width * next.width)), height = Math.max(20, Math.min(next.height, layer.height / previous.height * next.height)); return { ...layer, width, height, x: Math.min(next.width - width, layer.x / previous.width * next.width), y: Math.min(next.height - height, layer.y / previous.height * next.height) }; });
  setSelected(Math.min(selected, next.photoCount - 1));
  store.commit({ layoutId: id, layers });
 }
 function changeLayer(layer: EditableLayer) { store.commit({ layers: store.getSnapshot().present.layers.map(item => item.id === layer.id ? layer : item) }, `layer-${layer.id}`); }
 function addLayer(layer: EditableLayer) { if (project.layers.length >= 20) return; store.commit({ layers: [...project.layers, layer] }); setSelectedLayer(layer.id); }

 function setSettings(value: StripSettings | ((previous: StripSettings) => StripSettings)) { store.commit({ settings: typeof value === "function" ? value(store.getSnapshot().present.settings) : value }, "settings"); }
 const template = project.templateId; const [selected, setSelected] = useState(0);
 const [step, setStep] = useState(0); const [started, setStarted] = useState(false);

 const outputSize = exportDimensions(formatForLayout(), project.layoutId); const downloadSize = outputDimensions(formatForLayout(), project.layoutId, resolution); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
 const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [dark, setDark] = useState(false); const [dragOver, setDragOver] = useState(false);
 const input = useRef<HTMLInputElement>(null); const targetSlot = useRef<number | null>(null); const dragSlot = useRef<number | null>(null);
 useEffect(() => { photosRef.current = photos; }, [photos]);
 const count = photos.slice(0, required).filter(Boolean).length; const active = photos[selected];
 useEffect(() => { mounted.current = true; return () => { mounted.current = false;  }; }, []);
 function updatePhotos(next: (Photo | null)[]) { photosRef.current = next; store.replacePhotos(next, "photos"); }
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
 async function addFiles(files: File[], target: number | null = null, sourceIds?: string[]) {
  if (importing.current || !files.length) return; importing.current = true; setLoading(true); setError(""); setMessage(""); setStarted(true);
  const next = [...photosRef.current]; const available = target !== null ? [target] : next.slice(0, required).flatMap((p, i) => p ? [] : [i]);
  const errors: string[] = []; const loadedPhotos: Photo[] = []; let added = 0;
  if (files.length > available.length) errors.push(`There is room for ${available.length} photo${available.length === 1 ? "" : "s"}. Extra files were skipped.`);
  for (let index = 0; index < Math.min(files.length, available.length); index++) {
   try {
    const loaded = await loadPhoto(files[index]); const photo = sourceIds?.[index] ? {...loaded, id:sourceIds[index]} : loaded; if (!mounted.current) { releasePhoto(photo); break; }
    loadedPhotos.push(photo); const slot = available[index]; next[slot] = photo; added++;
   } catch (failure) { errors.push(`${files[index].name}: ${failure instanceof Error ? failure.message : "Could not load photo."}`); }
  }
  if (mounted.current) { updatePhotos(next); setError(errors.join(" ")); setMessage(added ? `${added} photo${added === 1 ? "" : "s"} added. Your photos are ready to edit.` : ""); setLoading(false); }
  if (!mounted.current) loadedPhotos.forEach(releasePhoto);
  importing.current = false;
 }
 function chooseFile(slot: number | null) { targetSlot.current = slot; if (input.current) { input.current.multiple = slot === null; input.current.click(); } }
 function removePhoto(index: number) { const next = [...photosRef.current]; next[index] = null; updatePhotos(next); }
 function movePhoto(from: number, to: number) { if (to < 0 || to >= required || from === to) return; const next = [...photosRef.current]; [next[from], next[to]] = [next[to], next[from]]; updatePhotos(next); setSelected(to); setMessage(`Photo moved to slot ${to + 1}.`); }
 async function output(print = false) {
  if (!readyPhotos || busy || loading || cloud.loadingProject) return; setBusy(true); setError(""); let win: Window | null = null;
  try { if (print) win = openPrintWindow(formatForLayout(), project.layoutId); const blob = await exportCollage(photos.slice(0, required).filter((photo): photo is Photo => photo !== null), settings, { format: formatForLayout(), mimeType: print ? "image/png" : mimeType, resolution: print ? "print" : resolution, quality: jpegQuality / 100, render: { layoutId: project.layoutId, layers: project.layers, cutGuide, logo:eventLogo } }); if (print && win) await printBlob(win, blob); else downloadBlob(blob, formatForLayout(), project.layoutId); setMessage(print ? "Print preview opened." : "Your image is downloaded."); }
  catch (failure) { win?.close(); setError(failure instanceof Error ? failure.message : "Could not prepare your image. Try again."); }
  finally { setBusy(false); }
 }
 function selectStep(next: number) { setStarted(true); setStep(next); }
 useEffect(() => {
  const shortcuts = (event: KeyboardEvent) => { if (cameraMode || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return; const element = event.target as HTMLElement; if (element.tagName === "TEXTAREA" || (element.tagName === "INPUT" && ["text", "date", "number"].includes((element as HTMLInputElement).type))) return; event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo(); };
  window.addEventListener("keydown", shortcuts); return () => window.removeEventListener("keydown", shortcuts);
 }, [store, cameraMode]);
 async function cameraPhotos(files: File[]) {
  if (cameraMode === "single") await addFiles(files, readyPhotos ? selected : null);
  else {
   const loaded: Photo[] = [];
   try { for (const file of files) loaded.push(await loadPhoto(file)); if (!mounted.current) { loaded.forEach(releasePhoto); return; } store.replacePhotos(loaded); setSelected(0); }
   catch (error) { loaded.forEach(releasePhoto); throw error; }
  }
  setCameraMode(null); setStarted(true); setStep(1);
 }

 async function receivePhone(assets:Asset[]) {
  const files:File[]=[];const ids:string[]=[];const references:Record<string,{original:string}>={};
  for(const asset of assets){const blob=await assetBlob(asset.id);const id=asset.source_id||crypto.randomUUID();files.push(new File([blob],"phone-photo",{type:blob.type}));ids.push(id);references[id]={original:asset.id};}
  if(!mounted.current)return;
  await addFiles(files,null,ids);cloud.registerAssets(references);
 }
 async function saveOnDevice(){const record=serializeProject(store);await writeLocalProject({id:project.id,name:settings.title||"My photo strip",updatedAt:project.updatedAt,record,exports:cloudExports,thumbnail:await projectThumbnail(store,cloudExports)});setMessage("Project saved in Local Projects on this device.");}
 const localOpened=useRef("");
 useEffect(()=>{const id=new URLSearchParams(location.search).get("local");if(!id||!autosave.ready||localOpened.current===id)return;localOpened.current=id;void readLocalProject(id).then(async value=>{const result=await hydrateProject(value.record);if(!mounted.current){result.photos.forEach(releasePhoto);return;}store.restore(result.project,result.photos);restoreExports(value.exports);setStarted(true);setStep(2);}).catch(f=>setError(f.message));},[autosave.ready,store,restoreExports]);
 async function shareOutput(){return exportCollage(photos.slice(0,required).filter((p):p is Photo=>p!==null),settings,{...cloudExports,resolution:"print",render:{layoutId:project.layoutId,layers:project.layers,cutGuide,logo:eventLogo}});}
 async function startEvent(value:EventRecord){
  const theme=templates.find(t=>t.id===value.template_id)!;const logo=value.logo_asset_id?await assetBlob(value.logo_asset_id):null;const logoPhoto=logo?await loadPhoto(new File([logo],"event-logo",{type:logo.type})):undefined;if(!mounted.current){if(logoPhoto)releasePhoto(logoPhoto);return;}
  const next={...newProject(),layoutId:value.layout_id,templateId:value.template_id,settings:{...theme.settings,title:value.name.slice(0,45),date:value.event_date||"",background:value.background,foreground:value.foreground},event:{id:value.id,allowCustomization:value.allow_customization,logoPhoto:logoPhoto?photoMetadata(logoPhoto):undefined}};
  const definition=getLayout(value.layout_id);next.layers=(theme.stickerPresets??[]).map(stickerId=>({id:`theme-${crypto.randomUUID()}`,type:"sticker" as const,stickerId,x:definition.width-180,y:definition.height-180,width:120,height:120,rotation:0,visible:true}));
  store.restore(next,logoPhoto?[logoPhoto]:[]);setEvent(value);setCameraMode("booth");setStarted(true);setStep(1);
 }
 const startEventRef=useRef(startEvent);useEffect(()=>{startEventRef.current=startEvent;});
 const eventLoaded=useRef("");
 useEffect(()=>{const id=new URLSearchParams(location.search).get("event");if(!id||!cloud.owner||!autosave.ready||eventLoaded.current===id)return;eventLoaded.current=id;void cloudRequest<EventRecord>(`events/${id}`).then(value=>startEventRef.current(value)).catch(failure=>setError(failure.message));},[cloud.owner,autosave.ready]);
 useEffect(()=>{if(project.event?.id&&cloud.owner&&event?.id!==project.event.id)void cloudRequest<EventRecord>(`events/${project.event.id}`).then(setEvent).catch(()=>{});},[project.event?.id,cloud.owner,event?.id]);
 const photoPanel = <section className="panel photos-panel" aria-label="Your photos">
  <div className="section-heading"><div><span className="eyebrow">THE CAST</span><h2>Your photos <span className="count">{count}/{required}</span></h2></div><button className="text-button" disabled={loading || count === required} onClick={() => chooseFile(null)}>+ Add</button></div>
  <p className="muted small">Four moments. In your favorite order.</p>
  <div className="photo-list">{photos.slice(0, required).map((photo, index) => <div key={photo?.id ?? index} className={`photo-row ${selected === index ? "active" : ""}`} draggable={!!photo && !loading} onDragStart={event => { dragSlot.current = index; event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragSlot.current = null; }} onDragOver={event => { if (dragSlot.current !== null) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragSlot.current !== null) { movePhoto(dragSlot.current, index); dragSlot.current = null; } }}>
   <span className="photo-number">0{index + 1}</span><button className="thumbnail" aria-label={photo ? `Select photo ${index + 1}` : `Add photo ${index + 1}`} disabled={loading} onClick={() => { setSelected(index); if (!photo) chooseFile(index); else selectStep(1); }}>{photo ? <img src={photo.url} alt="" /> : <span>+</span>}</button>
   <div className="photo-row-info"><button className="photo-label" onClick={() => { setSelected(index); if (photo) selectStep(1); }}><strong>{photo ? `Photo ${index + 1}` : "Your next moment"}</strong></button><span className="muted small">{photo ? "Drag to reorder" : "Choose a photo"}</span>{photo && <div className="row-tools"><button aria-label={`Move photo ${index + 1} up`} disabled={index === 0 || loading} onClick={() => movePhoto(index, index - 1)}>↑</button><button aria-label={`Move photo ${index + 1} down`} disabled={index === required - 1 || loading} onClick={() => movePhoto(index, index + 1)}>↓</button><button aria-label={`Replace photo ${index + 1}`} disabled={loading} onClick={() => chooseFile(index)}>Replace</button><button aria-label={`Remove photo ${index + 1}`} disabled={loading} onClick={() => removePhoto(index)}>×</button></div>}</div>
  </div>)}</div>
  <button className={`drop-zone ${dragOver ? "drag-over" : ""}`} disabled={loading || count === required} onClick={() => chooseFile(null)} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragOver(true); } }} onDragLeave={() => setDragOver(false)} onDrop={event => { event.preventDefault(); setDragOver(false); void addFiles(Array.from(event.dataTransfer.files)); }}><span className="upload-symbol">↥</span><strong>{loading ? "Opening your photos…" : count === required ? "All four moments, ready" : "Drop your photos here"}</strong><span>or browse files · JPG, PNG, WebP</span><span className="small">Up to 20 MB each</span></button>
  <div className="privacy-note"><span>◈</span> Just between you and your browser.<br />Photos stay local until you choose a cloud action.</div>
 </section>;
 const templatePanel = <section className="panel template-panel" aria-label="Strip designs"><span className="eyebrow">SET THE MOOD</span><h2>Choose a design</h2><label className="field">Theme category<select aria-label="Theme category" value={category} onChange={event => setCategory(event.target.value)}>{["All", ...new Set(templates.map(t => t.category ?? "Minimal"))].map(value => <option key={value}>{value}</option>)}</select></label><div className="template-list">{templates.filter(t => category === "All" || t.category === category).map(item => <button key={item.id} className={`template-card ${template === item.id ? "active" : ""}`} aria-pressed={template === item.id} onClick={() => selectTheme(item)}><span className="mini-strip" style={{ background: item.settings.background }}><i /><i /><i /><i /></span><span><strong>{item.name}</strong><span className="muted small">{item.note}</span></span><span className="template-check">{template === item.id ? "✓" : ""}</span></button>)}</div></section>;
 const cropPanel = <section className="panel crop-panel"><span className="eyebrow">MAKE IT YOURS</span><h2>Edit photo {selected + 1}</h2><p className="muted small">Drag a photo in the strip to reposition it. Use arrow keys or the sliders for fine adjustments.</p><div className="photo-tabs" aria-label="Select photo">{photos.slice(0, required).map((photo, index) => <button key={index} className={selected === index ? "active" : ""} onClick={() => setSelected(index)} aria-pressed={selected === index}>{index + 1}{!photo && <span className="sr-only"> empty</span>}</button>)}</div>{active ? <><RangeField label="Zoom" value={active.transform.zoom} min={1} max={3} step={0.01} suffix="×" onChange={value => transform({ ...active.transform, zoom: value })} /><RangeField label="Horizontal position" value={active.transform.panX} min={-1} max={1} step={0.01} onChange={value => transform({ ...active.transform, panX: value })} /><RangeField label="Vertical position" value={active.transform.panY} min={-1} max={1} step={0.01} onChange={value => transform({ ...active.transform, panY: value })} /><div className="transform-actions"><button className="secondary" onClick={() => transform({ ...active.transform, rotation: ((active.transform.rotation ?? 0) + 270) % 360 })}>Rotate left</button><button className="secondary" onClick={() => transform({ ...active.transform, rotation: ((active.transform.rotation ?? 0) + 90) % 360 })}>Rotate right</button><button className="secondary" aria-pressed={!!active.transform.flipX} onClick={() => transform({ ...active.transform, flipX: !active.transform.flipX })}>Flip horizontal</button><button className="secondary" aria-pressed={!!active.transform.flipY} onClick={() => transform({ ...active.transform, flipY: !active.transform.flipY })}>Flip vertical</button></div><details className="advanced-effects" open><summary>Color & filters</summary><PhotoEffectsPanel effects={active.effects} onChange={updateEffects} /></details><button className="secondary full" onClick={resetPhoto} >↺ Reset photo</button><span className="quality-note">Original: {active.width} × {active.height} px</span>{(active.width < 528 || active.height < 400) && <p className="small">This photo may look soft when printed.</p>}</> : <button className="secondary full" onClick={() => chooseFile(selected)}>Add photo {selected + 1}</button>}</section>;
 const stylePanel = <section className="panel style-panel"><span className="eyebrow">THE LITTLE DETAILS</span><h2>Customize your strip</h2><label className="color-field"><span>Background</span><span><input type="color" aria-label="Background color" value={settings.background} onChange={event => customize("background", event.target.value)} /><code>{settings.background.toUpperCase()}</code></span></label><label className="color-field"><span>Text & border</span><input type="color" aria-label="Text and border color" value={settings.foreground} onChange={event => customize("foreground", event.target.value)} /></label><RangeField label="Photo spacing" min={8} max={40} value={settings.spacing} onChange={value => customize("spacing", value)} /><RangeField label="Rounded corners" min={0} max={40} value={settings.radius} onChange={value => customize("radius", value)} /><label className="check-field"><span>Photo border</span><input type="checkbox" checked={settings.border} onChange={event => customize("border", event.target.checked)} /></label><label className="check-field"><span>Include a footer</span><input type="checkbox" checked={settings.showFooter} onChange={event => customize("showFooter", event.target.checked)} /></label>{settings.showFooter && <div className="footer-fields"><label>Strip title<input maxLength={45} value={settings.title} onChange={event => customize("title", event.target.value)} placeholder="Give this moment a name" /></label><label>Date<input type="date" value={settings.date} onChange={event => customize("date", event.target.value)} /></label><label>A little message<input maxLength={60} value={settings.footer} onChange={event => customize("footer", event.target.value)} /></label></div>}</section>;
 return <div className={`app ${dark ? "dark" : ""}`} onPointerUpCapture={() => store.endGroup()} onKeyUpCapture={() => store.endGroup()} onBlurCapture={() => store.endGroup()}>
  <a className="skip-link" href="#workspace">Skip to editor</a><header className="topbar" inert={cameraMode ? true : undefined}><Link href="/" className="brand"><span className="brand-mark"><i /><i /><i /></span>{brand.name}</Link><div className="topbar-right"><span className="local-badge"><i />Create locally · share when ready</span><button className="theme-toggle" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setDark(!dark)}>{dark ? "☀" : "☾"}</button></div></header>
  <main id="workspace" inert={cameraMode ? true : undefined}><div className="intro"><div><span className="eyebrow">A LITTLE STRIP. A LOT OF MEMORIES.</span><h1>Your moments,<br className="mobile-break" /> all together<span className="accent">.</span></h1><p>Pick four photos. Make them yours. Keep them forever.</p></div>{!started && <button className="primary create-button" onClick={() => { setStarted(true); chooseFile(null); }}>Create Photo Strip <span>↗</span></button>}</div>
  <div className="creation-actions"><button className="primary" onClick={() => chooseFile(null)} disabled={loading || !!autosave.pending}>Upload Photos</button><button className="secondary" onClick={() => setCameraMode("single")} disabled={!!autosave.pending}>Use Camera</button><button className="secondary" onClick={() => setCameraMode("booth")} disabled={!!autosave.pending}>Photo Booth</button><PwaControls /></div>
  {autosave.pending && <section className="restore-prompt" role="region" aria-label="Restore previous project"><h2>Restore previous project?</h2><p>Your unfinished project is saved on this device.</p><button className="primary" onClick={() => void autosave.restore()}>Restore</button><button className="secondary" onClick={() => void autosave.startNew()}>Start New</button></section>}
  <div className="autosave-status" role="status" aria-label="Autosave status">{autosave.status}{autosave.error && <><span className="error">{autosave.error}</span><button className="text-button" onClick={() => void autosave.retry()}>{autosave.readError ? "Retry local storage" : "Retry saving"}</button>{autosave.readError && <button className="text-button" onClick={() => void autosave.startNew()}>Start New</button>}</>}</div>
  {cloud.loadingProject && <p className="cloud-loading" role="status">{cloud.status} Downloads become available when the originals are ready.</p>}<CloudPanel key={cloud.owner??"guest"} cloud={cloud} ready={readyPhotos} onExport={shareOutput} onPhone={receivePhone} event={event} emptySlots={required-count} projectId={project.id} onLocalSave={saveOnDevice} onNext={()=>event?startEvent(event):Promise.resolve()} />
  <div className="history-toolbar"><button className="secondary" disabled={!history.past.length} onClick={store.undo}>Undo</button><button className="secondary" disabled={!history.future.length} onClick={store.redo}>Redo</button></div><nav className="steps" aria-label="Editor steps">{steps.map((label, index) => <button key={label} className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined} onClick={() => selectStep(index)}><span>{index === 0 && count === required ? "✓" : `0${index + 1}`}</span>{label}<span className="step-arrow">→</span></button>)}</nav>
  <input className="sr-only" ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose photos" multiple onChange={event => { const files = Array.from(event.target.files ?? []); const target = targetSlot.current; event.target.value = ""; void addFiles(files, target); }} />
  <div className="status-area">{error && <p className="error" role="alert" aria-label="Photo error">{error}</p>}<p className="status" role="status" aria-label="Editor status">{message || (loading ? "Opening your photos…" : "")}</p></div>
  <div className={`workspace step-${step}`} inert={autosave.pending ? true : undefined}><aside className="left-column"><div inert={cloud.loadingProject||photos.some(p=>p?.cloudPreview)?true:undefined}>{photoPanel}</div><div inert={customizationLocked ? true : undefined}>{templatePanel}<section className="panel layout-panel"><span className="eyebrow">CHANGE THE SHAPE</span><h2>Choose a layout</h2><label className="field">Layout<select aria-label="Layout" value={project.layoutId} onChange={event => changeLayout(event.target.value)}>{layouts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{required === 3 && <p className="muted small">Uses the first three photos. Your fourth photo is kept for other layouts.</p>}</section></div></aside><section className="preview-column" aria-label="Live strip preview"><div className="preview-toolbar"><span className="eyebrow">{step === 3 ? "READY FOR THE FRIDGE" : "YOUR LITTLE KEEPSAKE"}</span><span className="preview-status"><i />Live preview</span></div><div className="preview-stage"><div className="paper-label">made of good moments</div><StripPreview photos={photos} settings={settings} format={formatForLayout()} layoutId={project.layoutId} layers={project.layers} logo={eventLogo} selectedLayer={selectedLayer} onLayerSelect={setSelectedLayer} onLayerChange={changeLayer} guides={guides} margins={marginGuide} selected={selected} editable={step !== 3 && !customizationLocked} onSelect={index => { setSelected(index); if (photos[index]) selectStep(1); else chooseFile(index); }} onTransform={(index, value) => transform(value, index)} /><div className="preview-caption">{definition.kind === "strip" ? format === "sheet" ? "4 x 6 IN - TWO IDENTICAL STRIPS" : "2 x 6 IN - ONE LITTLE STRIP" : `${definition.width / 300} x ${definition.height / 300} IN - ${definition.name.toUpperCase()}`}</div></div><div className="format-toggle" hidden={definition.kind !== "strip"} aria-label="Print format"><button aria-pressed={format === "strip"} className={format === "strip" ? "active" : ""} onClick={() => setFormat("strip")}>Single 2×6 Strip</button><button aria-pressed={format === "sheet"} className={format === "sheet" ? "active" : ""} onClick={() => setFormat("sheet")}>4×6 Print Sheet</button></div><p className="preview-help">{step === 3 ? "Your preview matches the final print layout." : "Click a photo to edit · drag to find its best angle"}</p></section><aside className="right-column" inert={customizationLocked ? true : undefined}>{cropPanel}{stylePanel}{step >= 2 && <LayerPanel layers={project.layers} selected={selectedLayer} layout={layout} onSelect={setSelectedLayer} onChange={changeLayer} onAdd={addLayer} onDelete={id => { store.commit({ layers: project.layers.filter(layer => layer.id !== id) }); setSelectedLayer(null); }} />}</aside></div>
  {customizationLocked && <p role="status">This event uses the host&apos;s preset. You can review, print and share your strip.</p>}<details className="export-options"><summary>Export & print options</summary><div className="export-fields"><label className="field">Download format<select aria-label="Download format" value={mimeType} onChange={event => setMimeType(event.target.value as typeof mimeType)}><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select></label><label className="field">Export quality<select aria-label="Export quality" value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)}><option value="digital">Digital</option><option value="high">High Quality</option><option value="print">Print</option></select></label>{mimeType === "image/jpeg" && <RangeField label="JPEG quality" value={jpegQuality} min={70} max={98} suffix="%" onChange={setJpegQuality} />}<label className="field">Print preset<select aria-label="Print preset" value={definition.kind === "strip" ? format === "sheet" ? "dual" : "single" : project.layoutId === "full" ? "full" : "square"} onChange={event => { if (event.target.value === "full") changeLayout("full"); else if (event.target.value === "square") changeLayout("square"); else { changeLayout("classic"); setFormat(event.target.value === "dual" ? "sheet" : "strip"); } }}><option value="single">2×6 Strip</option><option value="dual">4×6 Dual Strip</option><option value="full">4×6 Full Collage</option><option value="square">4×4 Square</option></select></label></div><label className="check-field">Show safe area preview<input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} /></label><label className="check-field">Show printer margins preview<input type="checkbox" checked={marginGuide} onChange={event => setMarginGuide(event.target.checked)} /></label><label className="check-field">Include cut guide in exported dual strip<input type="checkbox" checked={cutGuide} onChange={event => setCutGuide(event.target.checked)} /></label><p className="muted small">Digital: 50% size - High Quality: 75% - Print: full 300 DPI target. Printing always uses full resolution. Preview guides stay out of downloads.</p></details>
  <div className="action-bar"><div><strong>{count === required ? "A keepsake, ready when you are." : "Every good strip starts with four photos."}</strong><span>{downloadSize.width} × {downloadSize.height} px · {resolution === "print" ? "300 DPI print target" : "digital download"}</span></div><div className="action-buttons">{step > 0 && <button className="secondary mobile-action" onClick={() => selectStep(step - 1)}>Back</button>}{step < 3 && <button className="secondary next-step" disabled={!readyPhotos} onClick={() => selectStep(step + 1)}>{steps[step + 1]} →</button>}<button className="secondary" disabled={!readyPhotos || busy || loading || cloud.loadingProject} onClick={() => void output(true)}>Print <span>↗</span></button><button className="primary" disabled={!readyPhotos || busy || loading || cloud.loadingProject} onClick={() => void output()}>{busy ? "Preparing…" : mimeType === "image/jpeg" ? "Download JPEG" : "Download PNG"}<span>↓</span></button></div></div>
  <p className="print-note">For printing: choose {outputSize.width / 300} x {outputSize.height / 300} inch paper, 100% scale, no margins, and turn off headers and footers. Your printer may add non-printable edges.</p>
  </main><footer className="site-footer"><span>{brand.name} — {brand.description}</span><span>Made to be kept.</span></footer>
 {cameraMode && <Suspense fallback={<div className="booth-backdrop" role="status">Preparing camera...</div>}><PhotoBooth mode={cameraMode} onClose={() => setCameraMode(null)} onContinue={cameraPhotos} /></Suspense>}
 </div>;
}
