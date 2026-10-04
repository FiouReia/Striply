# Striply architecture

V1 is a local-only Next.js App Router application. The server serves the application shell; photos never leave the browser. Branding lives in src/config/brand.ts.

## Boundaries
- features/photos: validation, original File/object URL ownership and decoding.
- features/editor: React state and accessible pan/zoom interaction. Transforms are serializable, independent of original files.
- features/templates: typed, immutable design configurations.
- features/collage: pure physical layout and crop calculations; shared Canvas renderer.
- features/export: re-decode original sources and encode a print-resolution canvas.
- features/print: isolated print document with exact physical page dimensions.
- components: shared controls; app: route shell, global styles and metadata.

## Rendering contract
All layout measurements use a canonical 600x1800 strip at 300 pixels/inch. Preview scales this layout; export renders originals at canonical resolution. A sheet is 1200x1800 with two identical strips. Crop uses cover-fit source rectangles and normalized pan in [-1,1]; zoom is [1,3]. Changing layout recomputes crops without modifying source images. Rotation can extend the transform model and renderer later; photo effects remain separate from crop transforms.

## Resource and state ownership
React owns a four-slot array and independent settings. Files are not encoded into state. Object URLs are revoked on replacement, removal and unmount. Preview uses reduced decoded images; export decodes sources afresh and releases them. Async imports are serialized and guard unmount. Max 20 MB/file and 40 megapixels decoded limit constrain resource use. No persistence or backend in V1; a future project serializer can store transforms/settings and an adapter can store original blobs separately. Undo/redo can snapshot serializable state without duplicating pixels.

## Extension decisions
Camera capture can produce Files through the photo loader. Future layouts can provide frames to the same renderer. Export encoding is separate from geometry, supporting JPEG/WebP and future PDF. Supabase, PWA, queues, accounts and commerce are intentionally deferred.

## Verification
Unit tests cover physical geometry, crop bounds, template validity and file validation. Browser tests cover upload/edit/reorder/template/preview/PNG dimensions and print document, plus mobile and keyboard operation. Release gates are lint, strict typecheck, tests, browser E2E and production build. Browser printing requires 100% scale, matching paper size and disabled headers/footers; printer hardware margins cannot be controlled by JavaScript.

## Per-photo effects
PhotoEffects is serializable state independent of crop transforms and original image resources. Presets and brightness/contrast/saturation adjustments use a shared pixel processor in features/photos/effects.ts. The renderer crops first, processes only frame-size pixels, then clips/composites the result; effects cannot bleed into borders, footer or adjacent photos. Preview processes reduced-size frame pixels, while export re-decodes originals and processes print-resolution frame pixels. A per-render cache reuses filtered frames for the identical second strip and releases scratch canvases afterwards. This avoids dependence on inconsistent browser support for Canvas filters. Effect reset preserves crop; photo replacement creates neutral effects; reordering carries settings with the photo.
