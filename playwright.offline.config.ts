import { defineConfig, devices } from "@playwright/test";
const port = process.env.STRIPLY_OFFLINE_PORT ?? "3001";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({ testDir: "./offline", outputDir: "test-results/offline", timeout: 60000, workers: 1, use: { baseURL, trace: "retain-on-failure" }, projects: [{ name: "offline-chromium", use: { ...devices["Desktop Chrome"] } }, { name: "offline-mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }], webServer: { command: "node scripts/serve-static.mjs", env: { PORT: port }, url: baseURL, reuseExistingServer: false } });
