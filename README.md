# Striply V2

A private, browser-only digital photo booth and collage editor built on the existing Next.js 16 / React 19 / TypeScript 6 / Tailwind 4 application.

## Run

Use Node 20.9+ and pnpm. On Windows PowerShell, use `pnpm.cmd` if script execution is disabled.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. Upload photos, use a camera, or start a four-shot Photo Booth session. Camera permission is requested only after camera entry. The default countdown is three seconds with a one-second pause; both timings are configurable. Review and retake individual shots before continuing. Captured output is not mirrored even when the preview is.

## Editing

Original photo files stay untouched. Crop/pan/zoom, rotate by 90 degrees, flip, and apply configured filters or individual color adjustments. Add custom text, curated local stickers and color overlays; move them in the preview or use position/size/rotation controls. Classic and three-photo strips, square and Polaroid grids, and full 4x6 collages share one renderer. The three-photo strip keeps the fourth photo available when switching layouts.

Undo/redo supports buttons, Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. Continuous gestures coalesce into one action; history is limited to 40 metadata snapshots and trimmed further when retained photo resources exceed an estimated 160 MB budget. Current photos are always retained. Native text inputs retain normal text undo behavior. Up to 20 composition layers are supported.

## Local saving

Projects autosave to IndexedDB after a short pause. Original image files are stored once per source, independently of project metadata. On reopening, choose Restore or Start New. Unsupported or damaged project records remain saved until an explicit Start New action. Storage failures do not prevent editing or exporting; recovery controls explain when saving is unavailable. Clearing browser/site data removes device-local projects. There are no accounts or cloud backups.

## Export and print

Download PNG or JPEG with Digital (50% pixel dimensions), High Quality (75%) or Print (100%) presets. JPEG quality ranges from 70% to 98%. Print always renders original images at full resolution.

- 2x6 strip: 600x1800 pixels; 4x6 dual strip: 1200x1800.
- Three-photo strip: same physical strip dimensions.
- Square/Polaroid grids: 1200x1200 pixels, 4x4 inches at 300 DPI target.
- Full 4x6 collage: 1200x1800 pixels.

Safe-area and margin previews stay out of exports. The optional cut guide is exported only when explicitly enabled for a dual strip. Choose matching paper dimensions, 100% scale, no margins and no browser headers/footers. Physical printer margins and borderless support vary by printer.

Supported inputs: JPEG/PNG/WebP, up to 20 MB and 40 megapixels per photo. Convert HEIC before importing. Export always uses originals, not a screenshot of the interface.

## Production and offline installation

```sh
pnpm build
pnpm start
```

Production serves the static `out/` folder. Production bundles application icons and a manifest; the build generates a versioned precached service worker shell. After the app reports Ready to use offline, it can reopen, import/edit photos, add local stickers, save/restore projects and export offline. Camera capture also works where the browser permits. Development is intentionally uncached.

Install app invokes an available browser install prompt or explains Add to Home Screen. Installation and camera APIs require HTTPS or localhost. Full Screen is optional and has a visible exit; Escape exits native fullscreen. Browser install/fullscreen support varies, especially on iOS. A waiting service worker update activates after existing Striply windows close, preserving active editing sessions.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm test:offline
```

Browser tests use mocked media streams, not a physical webcam. Production offline tests run a separate static server on port 3001. See ARCHITECTURE.md for state, resource, migration and rendering decisions. Branding is centralized in src/config/brand.ts. Local agent skills/configuration remain ignored by Git and are not required to run the application.

Deferred: accounts, Supabase, cloud storage/sharing, galleries, payments, GIF/video sessions, AI features, printer queues, PDF and OS kiosk locking.
