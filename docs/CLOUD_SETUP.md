# Striply V2.5 cloud setup

The editor works without configuration. To enable cloud features, connect a dedicated Supabase project or local instance and apply the SQL migrations in `supabase/migrations/`.

## Local Supabase

Docker must be running. Use your existing Supabase CLI/project instance. From this Striply checkout, a new dedicated local instance can be started with `pnpm dlx supabase start`. For an existing instance, use its URL/keys and apply migrations through its configured CLI or SQL connection.

```powershell
pnpm dlx supabase status
pnpm dlx supabase migration up --local
Copy-Item .env.example .env.local
```

Fill `.env.local` with the API URL, publishable (or legacy anon) key and service-role key supplied by your instance. The service-role key is exclusively server-side. Keep `.env.local` out of Git. Restart `pnpm.cmd dev` after changing browser configuration.

Local defaults: API `http://127.0.0.1:54321`, database port 54322, Studio port 54323. Local magic-link messages can be read in Supabase's local mail viewer. Add `http://localhost:3000/auth/callback` and your actual site origin's callback to Auth's allowed redirect URLs. The callback completes PKCE in the same browser that requested the link.

For Google sign-in, configure the Google provider on that instance, its client ID/secret and the Google OAuth callback shown by Supabase. Provider credentials belong in Supabase/server configuration, never in public browser variables. Email delivery and Google callbacks need a configured provider even though the sign-in UI is built in.

## Phone access and deployment

`NEXT_PUBLIC_SITE_URL` must be an address the guest's phone can reach. Localhost/127.0.0.1 QR codes point at the phone itself. For LAN testing, use the PC's reachable LAN address and run Next.js on `0.0.0.0`; production `pnpm start` does this. Camera/install APIs should be tested through HTTPS. Authenticated cross-device access also needs a Supabase API URL reachable from those devices.

V2.5 requires a Next.js Node server or a compatible server deployment. It is no longer a static `out/` deployment. The production build emits the service worker to `public/sw.js`. Run `pnpm build`, then `pnpm start`. Configure identical environment variables at build/runtime, HTTPS, site origin and provider redirect URLs on your host.

The private `striply-private` bucket is created by migrations. All upload writes pass server decoding and validation. Owner reads use RLS/signed URLs; public share/gallery delivery uses capability-checked, noncached routes. Restrictive Storage policies protect this bucket even when another application's permissive policies exist. Public tokens authorize one finished share/gallery/upload session, never an account.

## Retention and abuse controls

Schedule `pnpm cloud:cleanup` daily with server environment variables (or run `node scripts/cleanup-cloud.mjs` with injected credentials). It retires expired upload sessions, prunes abandoned/unreferenced assets after a one-day grace period, and drains the durable Storage deletion queue. Project/event/account cascades enqueue object paths before deleting metadata; failed Storage removals remain queued for retry. Active shares and project references retain their required assets. Expiration/revocation is enforced on every public request even before cleanup runs.

Rate limits use a PostgreSQL counter shared by all server instances. Public uploads: 30 requests/minute; public delivery: 240/minute; authenticated mutations: 80/minute per owner. Without a trusted proxy configuration public limits use one shared global bucket. Set `TRUST_PROXY=true` only behind a proxy that overwrites `x-forwarded-for`; client-supplied forwarding headers must not become trusted identity.

Phone sessions expire after 15 minutes, accept at most four JPEG/PNG/WebP images, and close at capacity or explicit host termination. Each image is limited to 20 MB/40 megapixels; both signature/format and complete decoding are checked server-side. Originals, previews and exports are separate asset types. Realtime arrival is owner-scoped; three-second polling while the host is visible/online remains the fallback.

## Verification

`pnpm test:cloud` runs the actual migrations in an embedded PostgreSQL engine and checks RLS, grants, cross-owner references, atomic revisions, restrictive Storage policies, rate limits and upload reservations. This proves database policy behavior independently of a running Supabase stack. `pnpm test:e2e:cloud` uses mocked Auth/cloud HTTP responses with the real browser SDK and editor. It does not verify your Google/email provider or a deployed Storage service.

For live integration checks, start the production server on port 3014 (`pnpm.cmd start --port 3014`) and run `pnpm.cmd test:cloud:live`. To use another port, set `STRIPLY_TEST_ORIGIN` to that server's origin. This creates disposable test accounts and images, verifies authenticated project round trips, cross-account denial, private Storage, revisions, public shares, expiry, phone uploads and deletion, then removes the fixtures. It uses the ignored `.env.local` configuration and never prints credentials.

With your local stack running, also verify magic-link/Google login, save/load in a second browser and phone upload from a real device. These provider and physical-device checks remain manual. Keep the service-role key server-only.

Supabase references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [magic links](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [OAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth).
