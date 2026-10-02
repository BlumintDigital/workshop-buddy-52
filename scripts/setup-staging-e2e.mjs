// One-off (rerunnable) setup of the smoke-check accounts on staging.shoplane.uk.
//
//   STAGING_URL=… STAGING_ANON_KEY=… STAGING_SERVICE_KEY=… node scripts/setup-staging-e2e.mjs
//
// Creates (or resets) admin, manager, staff and client test accounts with fresh random passwords,
// enrolls an authenticator for admin and manager, and writes the git-ignored files the smoke
// checks read: .env.staging.e2e and e2e/.state/mfa-secrets.staging.json. Store both as the
// GitHub secrets E2E_STAGING_ENV and E2E_STAGING_MFA. Prints no passwords or secrets.

import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const URL_ = process.env.STAGING_URL;
const ANON = process.env.STAGING_ANON_KEY;
const SERVICE = process.env.STAGING_SERVICE_KEY;
const SITE = process.env.STAGING_SITE ?? "https://staging.shoplane.uk";
if (!URL_ || !ANON || !SERVICE) throw new Error("Set STAGING_URL, STAGING_ANON_KEY and STAGING_SERVICE_KEY.");

const ACCOUNTS = [
  { key: "ADMIN", role: "admin", email: "e2e-admin@shoplane.uk", name: "Smoke Test Admin", mfa: true },
  { key: "MANAGER", role: "manager", email: "e2e-manager@shoplane.uk", name: "Smoke Test Manager", mfa: true },
  { key: "STAFF", role: "staff", email: "e2e-staff@shoplane.uk", name: "Smoke Test Staff", mfa: false },
  { key: "CLIENT", role: "client", email: "e2e-client@shoplane.uk", name: "Smoke Test Client", mfa: false },
];

function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const env = [`E2E_BASE_URL=${SITE}`, `VITE_SUPABASE_URL=${URL_}`, `VITE_SUPABASE_PUBLISHABLE_KEY=${ANON}`];
const mfa = {};

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
for (const a of ACCOUNTS) {
  const password = randomBytes(18).toString("base64url");
  let user = list.users.find((u) => u.email === a.email);
  if (user) {
    // Start from a clean slate: new password, no old authenticators.
    await admin.auth.admin.updateUserById(user.id, { password });
    const { data: f } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    for (const factor of f?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id });
  } else {
    const { error: pe } = await admin.rpc("provision_account", { _email: a.email, _role: a.role });
    if (pe) throw new Error(`provision_account for ${a.key}: ${pe.message}`);
    const { data, error } = await admin.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { full_name: a.name } });
    if (error) throw new Error(`create ${a.key}: ${error.message}`);
    user = data.user;
    if (a.role === "client") await admin.from("profiles").update({ company_name: "Smoke Test Ltd" }).eq("id", user.id);
  }
  env.push(`E2E_${a.key}_EMAIL=${a.email}`, `E2E_${a.key}_PASSWORD=${password}`);

  if (a.mfa) {
    const c = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error: se } = await c.auth.signInWithPassword({ email: a.email, password });
    if (se) throw new Error(`sign in ${a.key}: ${se.message}`);
    const { data: en, error: ee } = await c.auth.mfa.enroll({ factorType: "totp", friendlyName: "smoke-checks" });
    if (ee) throw new Error(`enroll ${a.key}: ${ee.message}`);
    const { data: ch } = await c.auth.mfa.challenge({ factorId: en.id });
    const { error: ve } = await c.auth.mfa.verify({ factorId: en.id, challengeId: ch.id, code: totp(en.totp.secret) });
    if (ve) throw new Error(`verify ${a.key}: ${ve.message}`);
    mfa[a.email] = { factorId: en.id, secret: en.totp.secret };
    await c.auth.signOut();
  }
  console.log(`${a.key}: ready (${a.email})`);
}

writeFileSync(".env.staging.e2e", env.join("\n") + "\n");
mkdirSync("e2e/.state", { recursive: true });
writeFileSync("e2e/.state/mfa-secrets.staging.json", JSON.stringify(mfa, null, 2));
console.log("Wrote .env.staging.e2e and e2e/.state/mfa-secrets.staging.json");
