import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const assets=[];
async function visit(root,prefix){for(const item of await fs.readdir(root,{withFileTypes:true})){const file=path.join(root,item.name);if(item.isDirectory())await visit(file,`${prefix}/${item.name}`);else if(item.name!=="sw.js")assets.push({file,url:`${prefix}/${item.name}`});}}
await visit(path.resolve(".next/static"),"/_next/static");await visit(path.resolve("public"),"");
const hash=createHash("sha256");for(const item of assets.sort((a,b)=>a.url.localeCompare(b.url))){hash.update(item.url);hash.update(await fs.readFile(item.file));}hash.update(await fs.readFile(".next/BUILD_ID"));
const version=hash.digest("hex").slice(0,16),urls=assets.map(a=>a.url);urls.push("/manifest.webmanifest");
const worker=`const CACHE="striply-${version}";const ASSETS=${JSON.stringify(urls)};
self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);for(const url of ["/","/local-projects"]){const response=await fetch(url,{credentials:"omit",cache:"no-store"});if(!response.ok)throw new Error("Shell unavailable");await cache.put(url,response);}})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith("striply-")&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener("fetch",event=>{const request=event.request,url=new URL(request.url);if(request.method!=="GET"||url.origin!==self.location.origin||request.headers.has("authorization")||url.pathname.startsWith("/api/")||url.pathname.startsWith("/auth/")||request.headers.has("rsc")||url.searchParams.has("_rsc"))return;
if(request.mode==="navigate"&&["/","/local-projects"].includes(url.pathname)){event.respondWith((async()=>{try{return await fetch(request);}catch{return await (await caches.open(CACHE)).match(url.pathname)||Response.error();}})());return;}
if(!ASSETS.includes(url.pathname))return;event.respondWith((async()=>await (await caches.open(CACHE)).match(url.pathname)||fetch(request))());});`;
await fs.writeFile("public/sw.js",worker);console.log(`PWA shell ${version}: ${urls.length} public assets cached; cloud/auth responses excluded`);
