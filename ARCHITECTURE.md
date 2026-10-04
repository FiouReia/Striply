# Striply V2 architecture

## V1 audit and migration plan
The existing app has a reusable pure crop/layout model, a Canvas renderer, original File ownership, per-photo effects and desktop/mobile tests. Constraints are a fixed four-slot single-layout model, component-local state and no persisted projects. Extend these modules and keep regression coverage; do not replace the app shell or introduce a backend.

## Domain boundaries
- photos: validation/decoding, non-destructive transforms and configured effects.
- project: versioned serializable project metadata, bounded history, IndexedDB persistence and a separately owned decoded-image registry.
- collage: configured layouts, oriented crops and one renderer for photo/text/sticker/overlay layers.
- editor: existing workflow controls, selection and progressive layer editing.
- templates: visual themes/categories independent from layout definitions.
- camera: media service, lifecycle hook, capture utility and cancellable booth sessions.
- export/print: original-source rendering, PNG/JPEG formats, digital/high/print scales, physical page geometry and optional exported guides.
- pwa: production-only versioned shell caching, install and fullscreen enhancements.

Branding stays in src/config/brand.ts. App Router server components only create the static shell; all photos/camera/projects stay on the user's device. No accounts, cloud storage, galleries, analytics or payments.

## Project and history ownership
Project version 2 stores IDs, ordered photo metadata, layout/template IDs, settings, layers and timestamps. Files live in IndexedDB photo records; ImageBitmaps/object URLs live in a Map outside history. React subscribes to a small project store. History holds up to 40 metadata snapshots, never copies pixels. An estimated 160 MB retained-source budget trims oldest undo/farthest redo records while keeping all current photos. Continuous edits coalesce by action key until pointer/key release; discrete actions break the group. Undo/redo updates metadata only, so sources remain available for deleted/replaced photos until no current/history record references them. UI selection, export preferences and camera state are separate.

## Geometry and rendering
Classic/three-photo strips use 600x1800 canonical pixels; square and Polaroid grids use 1200x1200 (4x4 inches at 300 DPI); full collages use 1200x1800. Strip sheet mode duplicates the full composition at x=600. Frames are calculated from a common layout schema. Quarter-turn rotation changes oriented source dimensions, pan/zoom crops that coordinate system, and a Canvas transform maps original sources directly into frame-size scratch canvases. Effects process only cropped pixels and are shared by preview/export. Scratch canvases are released after each render. Local SVG sticker assets are decoded once and used by the same renderer. Curated system fonts avoid network font requirements; text is bounded and painted as plain text.

## Layers
Discriminated layers have ID/type/position/size/rotation/visibility. Photo layers derive from frames; editable text, sticker and overlay layers are metadata. Positions are canonical composition coordinates; layout changes rescale layer bounds. Pointer movement and numeric controls use the same state actions and history batching. Footer title/date/message preserve the V1 contract alongside custom text layers.

## Persistence and recovery
IndexedDB stores one unfinished project and its original Files in an atomic transaction, with a debounced writer. Blobs are never base64 encoded. Startup blocks autosave until Restore or Start New is chosen. Restoring validates and explicitly migrates legacy v1 records to v2. Unsupported/future records are preserved and recovery errors shown. Quota/blocked/unsupported storage failures never stop editing; an explicit retry is available. Stale asynchronous loads are disposed. Autosave does not store object URLs or decoded images.

## Camera
Media permission is requested only after camera entry. A service provides acquisition, device enumeration, capture and useful errors. The hook stops tracks on device changes, close, unmount and stale acquisitions. The preview may mirror; capture never does. A cancellable session runs four countdown/capture/pause cycles, with configurable durations and review/individual retakes. Counts other than four remain a future session extension. Fullscreen has a visible exit and Escape support.

## PWA and release
A build step inventories out/ after static export, emits a content-hashed precache manifest and a versioned worker. Worker install caches the complete shell/assets; activation retires old caches, without forcibly interrupting active sessions. Only same-origin GET static requests are cached. Production registration shows offline availability after install; development stays uncached. Editing/import/camera (where permitted)/export/IndexedDB work offline. HTTPS or localhost is required for media and service workers.

Release gates: lint, strict TypeScript, unit/integration tests, upload/camera/restore browser tests and production build. A dedicated static-server test verifies offline shell/import/export. Real printer hardware, mobile camera constraints and browser install UI depend on the platform; exact canvas/page geometry is tested independently.
