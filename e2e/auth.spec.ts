import { test, expect } from "@playwright/test";
import { login, account } from "./helpers/auth";

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
    await expect(page.getByText(/welcome/i).first()).toBeVisible();
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
