import { Page, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { totp } from "./totp";

export type RoleKey = "ADMIN" | "MANAGER" | "STAFF" | "CLIENT";

export function account(roleKey: RoleKey) {
  const email = process.env[`E2E_${roleKey}_EMAIL`];
  const password = process.env[`E2E_${roleKey}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`E2E_${roleKey}_EMAIL / E2E_${roleKey}_PASSWORD not set — copy .env.e2e.example to .env.e2e and fill it in.`);
  }
  return { email, password };
}

const SECRETS_FILE = resolve(process.cwd(), "e2e/.state/mfa-secrets.json");

export function mfaSecretFor(email: string): string | null {
  if (!existsSync(SECRETS_FILE)) return null;
  const secrets = JSON.parse(readFileSync(SECRETS_FILE, "utf8"));
  return secrets[email]?.secret ?? null;
}

/**
 * Signs in through the real login form, completing the TOTP step when the
 * account has MFA (secret captured by global.setup.ts during enrollment).
 * "Remember this device" is intentionally left unchecked so every test run
 * exercises the full MFA path.
 */
export async function login(page: Page, roleKey: RoleKey) {
  const { email, password } = account(roleKey);
  await page.goto("/auth");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();

  const secret = mfaSecretFor(email);
  if (secret) {
    const otpInput = page.locator("input[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 20_000 });
    await otpInput.fill(totp(secret));
    await page.getByRole("button", { name: "Verify", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/(admin|manager|staff|client)\/dashboard/, { timeout: 20_000 });
}
