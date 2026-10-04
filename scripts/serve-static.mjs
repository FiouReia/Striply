import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("out"), port = Number(process.env.PORT || 3000);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json", ".txt": "text/plain" };
http.createServer(async (request, response) => {
 try { const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname)); if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
 const data = await fs.readFile(file); response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" }); response.end(data);
 } catch { response.writeHead(404); response.end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`Striply production: http://127.0.0.1:${port}`));
