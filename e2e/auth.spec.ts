import { test, expect } from "@playwright/test";
import { login, account, mfaSecretFor } from "./helpers/auth";
import { totp } from "./helpers/totp";

test.describe("authentication", () => {
  test("wrong password shows an error and stays on the login page", async ({ page }) => {
    const { email } = account("CLIENT");
    await page.goto("/auth");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill("definitely-wrong-password-123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("client signs in without MFA and lands on the client dashboard", async ({ page }) => {
    await login(page, "CLIENT");
    await expect(page).toHaveURL(/\/client\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("staff signs in and lands on the staff dashboard", async ({ page }) => {
    await login(page, "STAFF");
    await expect(page).toHaveURL(/\/staff\/dashboard/);
  });

  test("admin login shows the 2FA screen without flashing the dashboard first", async ({ page }) => {
    const { email, password } = account("ADMIN");
    // Regression check for the mfaCheckPending fix: the app must never route
    // into /admin/* between password success and the 2FA prompt.
    let dashboardFlash = false;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && /\/(admin|manager)\//.test(frame.url())) {
        dashboardFlash = true;
      }
    });

    await page.goto("/auth");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Two-Factor Authentication")).toBeVisible({ timeout: 20_000 });
    expect(dashboardFlash, "dashboard rendered before the 2FA screen").toBe(false);
  });

  test("admin completes 2FA and reaches the admin dashboard", async ({ page }) => {
    await login(page, "ADMIN");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("a wrong 2FA code is rejected", async ({ page }) => {
    const { email, password } = account("ADMIN");
    await page.goto("/auth");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    const otpInput = page.locator("input[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 20_000 });
    await otpInput.fill("000000");
    await page.getByRole("button", { name: "Verify", exact: true }).click();

    // Still on the 2FA screen — not signed in.
    await expect(page.getByText("Two-Factor Authentication")).toBeVisible();
    await expect(page).not.toHaveURL(/\/admin\//);
  });
});

test.describe("route guards", () => {
  test("client cannot open admin pages", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/admin/users");
    // ProtectedRoute bounces disallowed roles to their own dashboard.
    await expect(page).toHaveURL(/\/client\/dashboard/, { timeout: 15_000 });
  });

  test("staff cannot open admin settings", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/staff\/dashboard/, { timeout: 15_000 });
  });

  test("signed-out visitor is sent to the login page", async ({ page }) => {
    await page.goto("/client/dashboard");
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
  });
});

test.describe("trusted browser", () => {
  test("after trusting the browser, the next sign-in skips the 2FA code and still has full access", async ({ page }) => {
    const { email, password } = account("ADMIN");
    const secret = mfaSecretFor(email);
    test.skip(!secret, "admin has no 2FA set up in this database");

    const signInWithPassword = async () => {
      await page.goto("/auth");
      await page.locator("#login-email").fill(email);
      await page.locator("#login-password").fill(password);
      await page.getByRole("button", { name: "Sign In" }).click();
    };

    // First sign-in: enter the code and trust this browser.
    await signInWithPassword();
    const otpInput = page.locator("input[data-input-otp]");
    await expect(otpInput).toBeVisible({ timeout: 20_000 });
    await otpInput.fill(totp(secret!));
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 20_000 });
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("shoplane.device-trust.")))).toBe(true);

    // End the session but keep the browser's trust, as closing the browser would.
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sb-")).forEach((k) => localStorage.removeItem(k)));

    // Second sign-in: straight to the dashboard, no code.
    await signInWithPassword();
    const outcome = await Promise.race([
      page.waitForURL(/\/admin\/dashboard/, { timeout: 20_000 }).then(() => "dashboard"),
      otpInput.waitFor({ state: "visible", timeout: 20_000 }).then(() => "code"),
    ]);
    const askedForCode = outcome === "code";
    expect(askedForCode, "asked for a 2FA code on a trusted browser").toBe(false);

    // The database accepts the session: admin-only rows are readable.
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      return key ? JSON.parse(localStorage.getItem(key)!).access_token : null;
    });
    const res = await page.request.get(`${process.env.VITE_SUPABASE_URL}/rest/v1/user_roles?select=role`, {
      headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBe(true);
    expect((await res.json()).length, "admin sees the team's roles").toBeGreaterThan(1);
  });
});

test.describe("sign-up can't choose its role", () => {
  test("a direct sign-up asking for admin, without an invite code, is refused", async ({ request }) => {
    const email = `intruder-${Date.now()}@example.test`;
    const res = await request.post(`${process.env.VITE_SUPABASE_URL}/auth/v1/signup`, {
      headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json" },
      data: { email, password: "Intruder-Pass-2026!", data: { role: "admin", full_name: "Intruder" } },
    });
    expect(res.ok(), "the sign-up should be refused").toBe(false);
  });
});
