import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./cloud-e2e",
  outputDir: "test-results/cloud",
  timeout: 60000,
  workers: 2,
  use: { baseURL: "http://127.0.0.1:3012", trace: "retain-on-failure" },
  projects: [
    { name: "cloud-desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "cloud-mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3012",
    url: "http://127.0.0.1:3012",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      STRIPLY_TEST_DIST_DIR: ".next-cloud-test",
    },
    timeout: 120000,
  },
});
