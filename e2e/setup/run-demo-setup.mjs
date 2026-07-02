// One-off provisioning: signs in as the bootstrap admin and invokes the
// setup-demo edge function, which creates/resets the four demo accounts
// (demo.admin@workshop.demo etc.) with known passwords.
//
// Usage: node e2e/setup/run-demo-setup.mjs
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env and
// E2E_BOOTSTRAP_EMAIL / E2E_BOOTSTRAP_PASSWORD from .env.e2e.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env", ".env.e2e"]) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.E2E_BOOTSTRAP_EMAIL;
const password = process.env.E2E_BOOTSTRAP_PASSWORD;

if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env)");
if (!email || !password) throw new Error("Missing E2E_BOOTSTRAP_EMAIL / E2E_BOOTSTRAP_PASSWORD (.env.e2e)");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError) throw new Error(`Bootstrap admin sign-in failed: ${signInError.message}`);
console.log(`Signed in as ${email}`);

const { data, error } = await supabase.functions.invoke("setup-demo");
if (error) {
  let detail = error.message;
  if (error.context && typeof error.context.text === "function") {
    detail += ` — ${await error.context.text()} (status ${error.context.status})`;
  }
  throw new Error(`setup-demo failed: ${detail}`);
}

console.log("setup-demo result:");
for (const u of data?.users ?? []) {
  console.log(`  ${u.email} (${u.role}) created=${u.created} roleSet=${u.roleSet}`);
}
if (!data?.users?.length) console.log(JSON.stringify(data, null, 2));

await supabase.auth.signOut();
