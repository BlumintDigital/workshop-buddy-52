import { defineConfig } from "@playwright/test";
import { e2eTarget, loadEnvFiles } from "./helpers/env";

// Loads the database URL/key and .env.e2e (test accounts).
loadEnvFiles();

// By default the suite runs against the local test database, so it never
// writes test data to production. `npm run test:e2e:prod` runs only the
// read-only checks against the live app.
const target = e2eTarget();
// E2E_PORT moves the local dev server off 8081 when another app is using it.
const LOCAL_PORT = process.env.E2E_PORT ?? "8081";
const LOCAL_URL = `http://localhost:${LOCAL_PORT}`;
if (target === "local" && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.VITE_SUPABASE_URL ?? "")) {
  throw new Error(
    "The local test database isn't set up. Run `npm run test-db:start` and `npm run test-db:reset` first, " +
      "or `npm run test:e2e:prod` for the read-only checks against production.",
  );
}

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
    baseURL: target === "local" ? LOCAL_URL : process.env.E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      // channel: "chrome" uses the installed Google Chrome (GitHub's runners have it too), so no
      // Playwright browser download is required.
      use: { browserName: "chromium", channel: "chrome" },
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
      // Production gets only the specs that don't create or change data.
      ...(target === "prod" ? { testMatch: /(auth|a11y)\.spec\.ts$/ } : {}),
      // Staging gets the smoke checks run after each release to it.
      ...(target === "staging" ? { testMatch: /(auth|staging-smoke)\.spec\.ts$/ } : {}),
    },
  ],
  // Starts the app against the test database unless it's already running.
  webServer:
    target === "local"
      ? { command: `npx vite --mode testdb --port ${LOCAL_PORT} --strictPort`, cwd: "..", url: LOCAL_URL, reuseExistingServer: true, timeout: 120_000 }
      : undefined,
});
