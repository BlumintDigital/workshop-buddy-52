import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Where the suite runs. "local" (the default) is the test database from
 * `npm run test-db:start`; "prod" is the live app, for read-only checks only.
 */
export type E2ETarget = "local" | "prod";
export function e2eTarget(): E2ETarget {
  return process.env.E2E_TARGET === "prod" ? "prod" : "local";
}

/** The two-step sign-in codes differ per database, so each keeps its own file. */
export function mfaSecretsFile(root: string = process.cwd()): string {
  return resolve(root, "e2e/.state", e2eTarget() === "local" ? "mfa-secrets.local.json" : "mfa-secrets.json");
}

/**
 * Minimal .env loader (no dotenv dependency). Loads `.env` (Supabase URL/key)
 * and `.env.e2e` (test accounts) from the repo root; for the local target,
 * `.env.testdb.local` comes first so its database wins. Existing process env wins.
 */
export function loadEnvFiles(root: string = process.cwd()) {
  const files = e2eTarget() === "local" ? [".env.testdb.local", ".env", ".env.e2e"] : [".env", ".env.e2e"];
  for (const file of files) {
    const p = resolve(root, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  }
}
