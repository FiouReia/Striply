import type { NextConfig } from "next";
const config: NextConfig = { poweredByHeader: false, distDir: process.env.STRIPLY_TEST_DIST_DIR || ".next", async headers() { return [{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] }, { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }]; } };
export default config;
