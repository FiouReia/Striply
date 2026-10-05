# Striply V2.5

A guest-first digital photo booth and collage editor built on Next.js 16 / React 19 / TypeScript 6 / Tailwind 4. Create and print locally, with optional Supabase accounts, cloud projects, sharing and events.

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

Projects autosave to IndexedDB after a short pause. Original image files are stored once per source, independently of project metadata. On reopening, choose Restore or Start New. Unsupported or damaged project records remain saved until an explicit Start New action. Storage failures do not prevent editing or exporting; recovery controls explain when saving is unavailable. Clearing browser/site data removes device-local projects. This autosave stays local; cloud saving is a separate explicit action.

## Local projects and optional cloud

The active editor still autosaves on this device. Save on Device adds named projects to Local Projects, where they can be opened, renamed, duplicated or deleted without an account. Original files are stored separately from metadata and shared by local copies.

Cloud features require Supabase configuration; see [Cloud setup](docs/CLOUD_SETUP.md) and `.env.example`. The editor remains usable when cloud configuration or network access is unavailable. Sign in with an email magic link or Google only when cloud features are useful. Cloud actions preserve local work before navigating to sign-in.

Save to Cloud uploads originals plus small previews, with a revision-protected metadata update. My Projects supports opening across devices, rename, duplicate and delete. Once cloud saving is enabled for a project, subsequent changes sync after a pause. Offline changes are saved locally first and marked pending; reconnect resumes the same owner's queue. Sign-out or changing accounts never transfers another account's pending sync. Conflicts preserve local work: save it as a cloud copy, or load the cloud version while archiving the pending local version in Local Projects. Browser/site storage is still device-local and can be lost if cleared.

Create Share Link / QR uploads a finished print-resolution strip, with Private or Anyone with Link access and 24-hour, 7-day, 30-day or no expiration. Guests open a simple mobile download page without an account. My Projects includes link revocation. Source photographs are never part of public shares or galleries. Private, revoked and expired links are checked on every delivery request.

Add Photos from Phone creates a 15-minute, four-photo upload capability. Guests scan the QR and choose photos or use their phone camera; the visible host receives them through realtime notifications with polling fallback. The host can end the session, and full/expired sessions reject further uploads. Use a site address the phone can reach.

My Events supports names/dates, theme/layout/colors, an optional logo, host-controlled customization and explicitly enabled galleries (Private by default). Start Booth Session applies the preset and captures as before. The host can opt into automatic share/QR delivery after captures, then use Next Booth Session for the next group. Galleries contain only active, unexpired finished shares and use small previews; original exports are fetched for download.

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

V2.5 runs a Next.js server for validated cloud/public API routes. Production bundles icons and a manifest; the build generates a versioned service worker in `public/sw.js`. Static-only `out/` deployment is no longer supported. After the app reports Ready to use offline, it can reopen, import/edit photos, add local stickers, save/restore projects and export offline. Camera capture also works where the browser permits. Development is intentionally uncached. Only the anonymous editor/local-library shells and versioned public assets are cached; account, authentication, cloud and public delivery responses remain network-only. Cloud actions need a connection; local editing and pending saves do not.

Install app invokes an available browser install prompt or explains Add to Home Screen. Installation and camera APIs require HTTPS or localhost. Full Screen is optional and has a visible exit; Escape exits native fullscreen. Browser install/fullscreen support varies, especially on iOS. A waiting service worker update activates after existing Striply windows close, preserving active editing sessions.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:cloud
pnpm test:e2e:cloud
pnpm build
pnpm test:offline
```

Live Supabase verification is available with `pnpm test:cloud:live` against a configured production server; see [Cloud setup](docs/CLOUD_SETUP.md).

Browser tests use mocked media streams, not a physical webcam. Production offline tests run a separate Next.js server on port 3001 (override with STRIPLY_OFFLINE_PORT if needed). Cloud browser tests use an isolated dev build on port 3012 and mocked Auth/HTTP responses. Database tests execute real PostgreSQL migrations/RLS in PGlite; they do not replace live provider/Storage integration checks. See ARCHITECTURE.md for state, resource, migration and rendering decisions. Branding is centralized in src/config/brand.ts. Local agent skills/configuration remain ignored by Git and are not required to run the application.

Deferred: billing, payments/subscriptions, organization/admin tools, analytics, GIF/video sessions, AI features, printer queues, PDF and OS kiosk locking. Cloud cleanup must be scheduled as described in docs/CLOUD_SETUP.md.
