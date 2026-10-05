# Striply V2.5 architecture

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

Branding stays in src/config/brand.ts. App Router server components only create the static shell; all photos/camera/projects stay on the user's device. V2 remains available without an account; V2.5 adds separate optional cloud domains. Analytics and payments remain excluded.

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

## V2.5 cloud audit and decisions

The V2 renderer and editor remain client-side and guest-first. Cloud boundaries live in features/cloud, features/auth and server/cloud. Serializable V2 projects are wrapped in a cloud envelope (name, revision, export preferences, asset references); legacy local records still migrate through the existing validator. IndexedDB remains authoritative for active local work. Cloud linkage and pending edits are stored separately, scoped to the authenticated owner, and never silently transferred between accounts.

V2.5 replaces static-only hosting with a Next.js server deployment: public delivery and phone uploads require server validation. Client auth uses the publishable key and bearer sessions; private operations use a JWT-scoped Supabase client and RLS. Only controlled public delivery, validated storage writes and cleanup use a server-only service credential. Missing configuration leaves the editor fully usable and explains that cloud features are unavailable.

Entities: profiles -> projects/project_assets and events -> booth_sessions; projects -> shares; upload_sessions -> project_assets. Composite ownership foreign keys prevent cross-owner references. All user tables have owner RLS, public tables have no anonymous read policy. Storage is a private bucket with owner read access and server-only writes. Random object names are generated on the server. Revisions change through an atomic compare-and-swap function; conflicts offer loading cloud or saving local as a copy, never blind overwrite.

Public share/gallery/upload tokens are 256-bit random bearer capabilities. Share/upload secrets are stored as SHA-256 hashes; gallery tokens also remain available to their owner under RLS so gallery links stay stable across event edits. Shares expose only a finished export through a no-store delivery route that rechecks privacy, status and expiry on every request. Galleries default Private and include only active, unexpired finished shares. Upload sessions last 15 minutes, accept up to four validated images, use row-locked reservations and a database-backed rate limiter, and close automatically at capacity. Realtime arrival has bounded polling fallback. Image validation checks byte signatures, decoded format/dimensions and full decode server-side; editing and final rendering stay in the browser.

Cloud save first persists a complete local pending snapshot, including originals, then uploads changed sources plus small previews and commits metadata with expected revision. Reconnect retries pending work for the same account; offline editing never waits for network. Explicit saves enable subsequent debounced sync. Progressive cloud loading paints preview resources before originals; export waits for required originals. Cleanup queues store object paths before metadata deletion and retry on subsequent operations/scheduled cleanup. Deleted/revoked/expired shares cannot be read, and source files are never guest gallery items.

PWA caches only the anonymous editor shell and versioned static assets. API, authentication callbacks, account pages, share/gallery pages and private delivery are network-only, with no-store response headers. No service-worker cache contains authenticated data. Existing local/offline tests remain release gates alongside real PostgreSQL RLS tests and mocked cloud/auth browser flows. Live provider callbacks require a running configured Supabase instance.

V2.5 named local projects use a separate IndexedDB library with metadata/original-file stores and deduplicated source IDs. Optional event context/logo metadata extends the compatible V2 project schema; logo resources participate in persistence, history ownership and the shared preview/export renderer. Cloud preview resources are explicitly marked temporary: autosave/export cannot mistake them for originals. Cloud loading failures preserve the prior disk save and offer retry. Automatic event QR delivery is opt-in and depends on an explicit link-sharing event setting.
