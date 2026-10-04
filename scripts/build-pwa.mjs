import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("out"), files = [];
async function visit(directory) { for (const item of await fs.readdir(directory, { withFileTypes: true })) { const location = path.join(directory, item.name); if (item.isDirectory()) await visit(location); else if (item.name !== "sw.js") files.push(location); } }
await visit(root); files.sort(); const hash = createHash("sha256");
for (const file of files) { hash.update(path.relative(root, file)); hash.update(await fs.readFile(file)); }
const version = hash.digest("hex").slice(0, 16), urls = files.map(file => "/" + path.relative(root, file).replaceAll("\\", "/")); urls.push("/");
const worker = `const CACHE = "striply-${version}"; const ASSETS = ${JSON.stringify(urls)};
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); });
self.addEventListener("activate", event => { event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith("striply-") && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()); });
self.addEventListener("fetch", event => { const request = event.request, url = new URL(request.url); if (request.method !== "GET" || url.origin !== self.location.origin) return;
 event.respondWith((async () => { const cache = await caches.open(CACHE); const cached = await cache.match(url.pathname); if (cached) return cached; try { return await fetch(request); } catch (error) { if (request.mode === "navigate") return await cache.match("/") || Response.error(); return Response.error(); } })());
});`;
await fs.writeFile(path.join(root, "sw.js"), worker); console.log(`PWA shell ${version}: ${urls.length} assets cached`);
