import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { logProjectAtReception } from "./helpers/projects";

const JOB_TITLE = `E2E manager job ${Date.now()}`;

test.describe("manager role", () => {
  test("manager signs in with 2FA and reaches the manager dashboard", async ({ page }) => {
    await login(page, "MANAGER");
    await expect(page).toHaveURL(/\/manager\/dashboard/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Needs attention")).toBeVisible();
  });

  test("manager sees the staff management page", async ({ page }) => {
    await login(page, "MANAGER");
    await page.goto("/manager/staff");
    await expect(page.getByRole("heading", { name: "Staff", level: 1 })).toBeVisible();
    // Requires the "Managers can view all profiles" RLS policy (restored
    // 2026-07-02) — without it every name renders as "Unknown".
    await expect(page.getByText("Demo Staff")).toBeVisible({ timeout: 15_000 });
  });

  test("manager logs a project at reception for the demo client", async ({ page }) => {
    await login(page, "MANAGER");
    await logProjectAtReception(page, JOB_TITLE, { client: "Demo Client" });
    await expect(page.getByText(/EDL-\d{6}-\d{3}/).first()).toBeVisible();
  });

  test("manager cannot open admin-only pages", async ({ page }) => {
    await login(page, "MANAGER");
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/manager\/dashboard/, { timeout: 15_000 });
  });
});
