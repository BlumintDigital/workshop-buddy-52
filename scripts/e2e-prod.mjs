#!/usr/bin/env node
// Read-only checks against the live app (sign-in, route guards, accessibility).
// Everything else runs against the local test database: npm run test:e2e
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).map((a) => JSON.stringify(a)).join(" ");
const r = spawnSync(`npx playwright test -c e2e/playwright.config.ts ${args}`, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, E2E_TARGET: "prod" },
});
process.exit(r.status ?? 1);
