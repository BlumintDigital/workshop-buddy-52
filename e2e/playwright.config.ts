import { defineConfig } from "@playwright/test";
import { loadEnvFiles } from "./helpers/env";

// Loads .env (Supabase URL/key) and .env.e2e (test accounts + target URL).
loadEnvFiles();

// Separate config from the root playwright.config.ts (which belongs to the
// Lovable agent tooling). Run with: npm run test:e2e
export default defineConfig({
  testDir: ".",
  outputDir: "./.results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Flows share database state (requests, invoices), so run serially.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "./.report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      // channel: "chrome" uses the locally installed Google Chrome, so no
      // Playwright browser download is required.
      use: { browserName: "chromium", channel: "chrome" },
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
    },
  ],
});
