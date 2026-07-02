// Reproduces the two E2E failures directly via the SDK to get real error messages.
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
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

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0");
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── 1. Client: approve the latest quoted E2E request ──
{
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error: e1 } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD,
  });
  if (e1) { console.log("client sign-in FAILED:", e1.message); process.exit(1); }

  const { data: reqs, error: e2 } = await supabase
    .from("client_requests")
    .select("id, title, status")
    .like("title", "E2E request%")
    .eq("status", "quoted")
    .order("created_at", { ascending: false })
    .limit(1);
  console.log("client: latest quoted E2E request:", JSON.stringify(reqs), e2?.message ?? "");

  if (reqs?.length) {
    const { data, error } = await supabase.rpc("client_decide_quote", {
      _request_id: reqs[0].id, _approve: true, _reason: null,
    });
    console.log("client_decide_quote →", data ?? "", error ? `ERROR: ${error.message} (code ${error.code})` : "OK");
  }
  await supabase.auth.signOut();
}

// ── 2. Admin at aal2: run the invoice page's clients query ──
{
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error: e1 } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD,
  });
  if (e1) { console.log("admin sign-in FAILED:", e1.message); process.exit(1); }

  const secrets = JSON.parse(readFileSync(resolve(process.cwd(), "e2e/.state/mfa-secrets.json"), "utf8"));
  const { secret, factorId } = secrets[process.env.E2E_ADMIN_EMAIL];
  const { data: ch, error: e3 } = await supabase.auth.mfa.challenge({ factorId });
  if (e3) { console.log("admin MFA challenge FAILED:", e3.message); process.exit(1); }
  const { error: e4 } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: totp(secret) });
  console.log("admin MFA verify:", e4 ? `FAILED: ${e4.message}` : "OK (aal2)");

  const { data: roles, error: e5 } = await supabase.from("user_roles").select("user_id").eq("role", "client");
  console.log(`admin: user_roles role=client → ${roles?.length ?? 0} rows`, e5 ? `ERROR: ${e5.message}` : "");
  if (roles?.length) {
    const { data: profiles, error: e6 } = await supabase
      .from("profiles").select("id, full_name").in("id", roles.map((r) => r.user_id));
    console.log("admin: client profiles →", JSON.stringify(profiles?.map((p) => p.full_name)), e6 ? `ERROR: ${e6.message}` : "");
  }
  await supabase.auth.signOut();
}
