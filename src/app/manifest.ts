import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
 return { name: brand.name, short_name: brand.name, description: brand.description, start_url: "/", scope: "/", display: "standalone", background_color: "#f7f7f2", theme_color: "#3f563e", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
