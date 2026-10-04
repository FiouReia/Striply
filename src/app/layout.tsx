import type { Metadata, Viewport } from "next";
import { brand } from "@/config/brand";
import "./globals.css";
export const viewport: Viewport = { themeColor: "#3f563e" };
export const metadata: Metadata = { title: `${brand.name} — Your moments, in a strip`, description: "Create a four-photo keepsake. Edit locally, customize your strip, and download a print-ready photo booth strip." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
