// Checks whether the demo accounts already exist by attempting sign-in.
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

const accounts = [
  ["ADMIN", process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD],
  ["MANAGER", process.env.E2E_MANAGER_EMAIL, process.env.E2E_MANAGER_PASSWORD],
  ["STAFF", process.env.E2E_STAFF_EMAIL, process.env.E2E_STAFF_PASSWORD],
  ["CLIENT", process.env.E2E_CLIENT_EMAIL, process.env.E2E_CLIENT_PASSWORD],
];

for (const [role, email, password] of accounts) {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.log(`${role} ${email}: FAIL — ${error.message}`);
  } else {
    const { data: roleData } = await supabase.rpc("get_user_role", { _user_id: data.user.id });
    console.log(`${role} ${email}: OK (role in DB: ${roleData ?? "none/hidden"})`);
    await supabase.auth.signOut();
  }
}
