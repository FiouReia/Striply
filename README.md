# Striply

A private, browser-only four-photo strip editor built with Next.js 16, React 19, TypeScript 6 and Tailwind 4.

## Run

Node 20.9+ and pnpm are required. On Windows PowerShell, use `pnpm.cmd` if script execution is disabled.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. Photos remain on your device; there are no photo uploads, accounts or backend. Refreshing closes the current session.

## Check

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

The production build exports static files to `out/`, suitable for any static host. Branding is centralized in `src/config/brand.ts`. See ARCHITECTURE.md for domain boundaries. Project skills are under `.codex/skills/`.

## Print

PNG files use 600×1800 pixels for a 2×6 strip or 1200×1800 for a 4×6 sheet containing two identical strips. These dimensions target 300 DPI at the stated physical sizes; PNG metadata is not relied on for paper sizing. Select the correct paper dimensions, 100% scale, no margins, no headers/footers. Hardware margins and borderless settings depend on your printer. Source photos below print resolution can appear soft.

Supported inputs: JPEG, PNG, WebP; 20 MB and 40 megapixels maximum per photo. HEIC needs conversion before import. Current editing supports cover-fit crop, pan and zoom, five templates, footer text and style controls. Each photo supports Original, Black & White, Sepia, Warm, Cool and Vintage looks plus brightness, contrast and saturation adjustments. Effects appear in previews, downloads and prints while original files remain untouched. Rotation, webcam, persistence and PDF are future work.
