import { test as setup, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { totp } from "./helpers/totp";

/**
 * Provisions MFA for the admin/manager test accounts entirely through the
 * Supabase SDK — no authenticator app needed. Enrolls a TOTP factor, verifies
 * it, and saves the secret to e2e/.state/mfa-secrets.json (gitignored) so the
 * login helper can generate codes during tests.
 *
 * Also sanity-checks that every configured account can sign in at all, so a
 * bad password fails fast here instead of mid-suite.
 */

const STATE_DIR = resolve(process.cwd(), "e2e/.state");
const SECRETS_FILE = resolve(STATE_DIR, "mfa-secrets.json");

const MFA_ROLES = ["ADMIN", "MANAGER"] as const;
const ALL_ROLES = ["ADMIN", "MANAGER", "STAFF", "CLIENT"] as const;

setup("verify accounts and enroll MFA", async () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  expect(url, "VITE_SUPABASE_URL missing — is .env present in the repo root?").toBeTruthy();
  expect(key, "VITE_SUPABASE_PUBLISHABLE_KEY missing — is .env present?").toBeTruthy();

  const secrets: Record<string, { factorId: string; secret: string }> =
    existsSync(SECRETS_FILE) ? JSON.parse(readFileSync(SECRETS_FILE, "utf8")) : {};

  for (const roleKey of ALL_ROLES) {
    const email = process.env[`E2E_${roleKey}_EMAIL`];
    const password = process.env[`E2E_${roleKey}_PASSWORD`];
    if (!email || !password) continue; // account not configured — specs needing it will skip/fail explicitly

    const supabase = createClient(url!, key!, { auth: { persistSession: false } });
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    expect(signInError, `${roleKey} (${email}): sign-in failed — ${signInError?.message}`).toBeNull();

    if (!(MFA_ROLES as readonly string[]).includes(roleKey)) {
      await supabase.auth.signOut();
      continue;
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verifiedFactor = factors?.totp?.find((f) => f.status === "verified");

    if (verifiedFactor) {
      // Already enrolled — we can only proceed if we captured the secret in a previous run.
      expect(
        secrets[email]?.secret,
        `${roleKey} (${email}) already has a verified TOTP factor but its secret isn't in e2e/.state. ` +
          `Use a fresh account, or remove the factor so setup can enroll one it knows the secret for.`,
      ).toBeTruthy();
      await supabase.auth.signOut();
      continue;
    }

    // Clear any dangling unverified factors from aborted runs, then enroll.
    for (const f of factors?.totp ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }

    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "e2e-tests",
    });
    expect(enrollError, `${roleKey}: MFA enroll failed — ${enrollError?.message}`).toBeNull();

    const factorId = enrolled!.id;
    const secret = (enrolled as any).totp.secret as string;

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    expect(challengeError, `${roleKey}: MFA challenge failed — ${challengeError?.message}`).toBeNull();

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge!.id,
      code: totp(secret),
    });
    expect(verifyError, `${roleKey}: MFA verify failed — ${verifyError?.message}`).toBeNull();

    secrets[email] = { factorId, secret };
    await supabase.auth.signOut();
  }

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2));
});
