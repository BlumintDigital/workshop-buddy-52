#!/usr/bin/env node
// Local test database for end-to-end tests, kept apart from production.
//
//   node scripts/test-db.mjs start   start it (Docker) and write .env.testdb.local
//   node scripts/test-db.mjs reset   wipe it, rebuild the schema and add the test people
//   node scripts/test-db.mjs stop    stop it
//   node scripts/test-db.mjs status  show its URLs
//   node scripts/test-db.mjs rls     run the database security tests (supabase/tests)
//
// The schema is production's (supabase-test/supabase/migrations/2026010100000*),
// plus every migration in supabase/migrations newer than that baseline. Test
// accounts come from .env.e2e, so the same logins work here and on production.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(import.meta.dirname, "..");
const WORKDIR = join(ROOT, "supabase-test");
const TEST_SUPABASE = join(WORKDIR, "supabase");
const ENV_FILE = join(ROOT, ".env.testdb.local");
const MFA_STATE = join(ROOT, "e2e", ".state", "mfa-secrets.local.json");
const DB_CONTAINER = "supabase_db_shoplane_test";
// CI installs the CLI directly; locally npx fetches it.
const SUPABASE_CLI = process.env.SUPABASE_CLI ?? "npx supabase";

// The newest migration already in the production dump. Everything after it is
// applied on top at reset. Bump it when the baseline is re-dumped.
const BASELINE_VERSION = "20261003100000";

const PEOPLE = [
  { key: "ADMIN", role: "admin", full_name: "Demo Admin" },
  { key: "MANAGER", role: "manager", full_name: "Demo Manager" },
  { key: "STAFF", role: "staff", full_name: "Demo Staff" },
  { key: "CLIENT", role: "client", full_name: "Demo Client", company_name: "Demo Client Ltd" },
];

function supabase(args, { capture = false } = {}) {
  const r = spawnSync(`${SUPABASE_CLI} ${args.join(" ")} --workdir "${WORKDIR}"`, {
    cwd: ROOT,
    shell: true,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0) {
    if (capture) process.stderr.write(r.stderr ?? "");
    throw new Error(`supabase ${args.join(" ")} failed`);
  }
  return r.stdout ?? "";
}

function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

/** Copy the edge functions and any migrations newer than the baseline into the test project. */
function sync() {
  // Copy over rather than delete first: the running stack keeps the folder open.
  const fnSource = join(ROOT, "supabase", "functions");
  const fnTarget = join(TEST_SUPABASE, "functions");
  cpSync(fnSource, fnTarget, { recursive: true, force: true });
  for (const f of readdirSync(fnTarget)) {
    if (!existsSync(join(fnSource, f))) rmSync(join(fnTarget, f), { recursive: true, force: true });
  }

  const migTarget = join(TEST_SUPABASE, "migrations");
  mkdirSync(migTarget, { recursive: true });
  for (const f of readdirSync(migTarget)) {
    if (!f.startsWith("2026010100000")) rmSync(join(migTarget, f));
  }
  const newer = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => f.endsWith(".sql") && f.slice(0, 14) > BASELINE_VERSION);
  for (const f of newer) cpSync(join(ROOT, "supabase", "migrations", f), join(migTarget, f));
  if (newer.length) console.log(`Applying ${newer.length} migration(s) newer than the baseline: ${newer.join(", ")}`);
}

function status() {
  const text = supabase(["status", "-o", "env"], { capture: true });
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function writeEnv(s) {
  writeFileSync(
    ENV_FILE,
    [
      "# Written by scripts/test-db.mjs. Points `npm run dev:test` and the E2E tests",
      "# at the local test database instead of production.",
      `VITE_SUPABASE_URL="${s.API_URL}"`,
      `VITE_SUPABASE_PUBLISHABLE_KEY="${s.ANON_KEY}"`,
      `VITE_SUPABASE_PROJECT_ID="shoplane_test"`,
      `TEST_DB_SERVICE_ROLE_KEY="${s.SERVICE_ROLE_KEY}"`,
      "",
    ].join("\n"),
  );
}

function isRunning() {
  try {
    status();
    return true;
  } catch {
    return false;
  }
}

async function seedPeople(s) {
  const e2e = loadEnv(join(ROOT, ".env.e2e"));
  const admin = createClient(s.API_URL, s.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const p of PEOPLE) {
    const email = e2e[`E2E_${p.key}_EMAIL`];
    const password = e2e[`E2E_${p.key}_PASSWORD`];
    if (!email || !password) {
      console.log(`  skipped ${p.key.toLowerCase()}: no E2E_${p.key}_EMAIL / _PASSWORD in .env.e2e`);
      continue;
    }
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.full_name, role: p.role, company_name: p.company_name },
    });
    if (error) throw new Error(`Could not create the ${p.role} test account: ${error.message}`);
    console.log(`  ${p.role}: ${p.full_name}`);
  }
}

/** Every .sql file under a folder, sorted, for a stable test order. */
function sqlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? sqlFiles(join(dir, e.name)) : e.name.endsWith(".sql") ? [join(dir, e.name)] : []))
    .sort();
}

/**
 * Runs the pgTAP files in supabase/tests straight through psql in the database
 * container. (`supabase test db` can't see the files through Docker on Windows.)
 * Each file rolls itself back, so the database is left as it was.
 */
function runDatabaseTests() {
  const psql = (input) =>
    spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-t", "-v", "ON_ERROR_STOP=1"], {
      input,
      encoding: "utf8",
    });
  const setup = psql("create extension if not exists pgtap with schema extensions;");
  if (setup.status !== 0) throw new Error(`Could not reach the test database: ${setup.stderr}`);

  let failed = 0;
  let passed = 0;
  for (const file of sqlFiles(join(ROOT, "supabase", "tests"))) {
    const r = psql(readFileSync(file, "utf8"));
    const lines = `${r.stdout}\n${r.stderr}`.split(/\r?\n/).map((l) => l.trim().replace(/\s*\+$/, ""));
    const bad = lines.filter((l) => /^not ok/.test(l) || /^ERROR:/.test(l) || /^# Looks like/.test(l));
    passed += lines.filter((l) => /^ok /.test(l)).length;
    const name = file.slice(ROOT.length + 1);
    if (r.status !== 0 || bad.length) {
      failed++;
      console.log(`FAIL ${name}`);
      for (const l of lines.filter((l) => /^(not ok|ERROR:|#)/.test(l))) console.log(`     ${l}`);
    } else {
      console.log(`ok   ${name}`);
    }
  }
  console.log(`\n${passed} checks passed${failed ? `, ${failed} file(s) failed` : ""}.`);
  if (failed) process.exit(1);
}

const command = process.argv[2] ?? "status";

if (command === "start") {
  sync();
  if (!isRunning()) supabase(["start"]);
  const s = status();
  writeEnv(s);
  console.log(`\nTest database running.\n  API:    ${s.API_URL}\n  Studio: ${s.STUDIO_URL}\n  Email:  ${s.INBUCKET_URL ?? s.MAILPIT_URL ?? "(local inbox)"}\nWrote .env.testdb.local. Next: npm run test-db:reset (first time), then npm run dev:test.`);
} else if (command === "reset") {
  sync();
  if (!isRunning()) supabase(["start"]);
  supabase(["db", "reset"]);
  const s = status();
  writeEnv(s);
  // A fresh database has no two-step sign-in set up, so forget old codes.
  rmSync(MFA_STATE, { force: true });
  console.log("Adding test people:");
  await seedPeople(s);
  console.log("\nTest database reset.");
} else if (command === "rls") {
  runDatabaseTests();
} else if (command === "stop") {
  supabase(["stop"]);
} else if (command === "status") {
  const s = status();
  console.log(`API: ${s.API_URL}\nStudio: ${s.STUDIO_URL}`);
} else {
  console.error(`Unknown command "${command}". Use start, reset, rls, stop or status.`);
  process.exit(1);
}

