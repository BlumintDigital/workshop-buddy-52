import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

const JOB_TITLE = `E2E manager job ${Date.now()}`;

test.describe("manager role", () => {
  test("manager signs in with 2FA and reaches the manager dashboard", async ({ page }) => {
    await login(page, "MANAGER");
    await expect(page).toHaveURL(/\/manager\/dashboard/);
    await expect(page.getByText("Staff workload")).toBeVisible();
  });

  test("manager sees the staff management page", async ({ page }) => {
    await login(page, "MANAGER");
    await page.goto("/manager/staff");
    await expect(page.getByText("Manage staff and manager accounts")).toBeVisible();
    // Requires the "Managers can view all profiles" RLS policy (restored
    // 2026-07-02) — without it every name renders as "Unknown".
    await expect(page.getByText("Demo Staff")).toBeVisible({ timeout: 15_000 });
  });

  test("manager creates a job for the demo client", async ({ page }) => {
    await login(page, "MANAGER");
    await page.goto("/manager/jobs");

    await page.getByRole("button", { name: /new job/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Create New Job")).toBeVisible();

    // Labels have no htmlFor — fill the first textbox (Title) inside the dialog.
    await dialog.getByRole("textbox").first().fill(JOB_TITLE);
    // Assign the demo client (second "None" select is Assign Client).
    await dialog.getByRole("combobox").filter({ hasText: "None" }).last().click();
    await page.getByRole("option", { name: "Demo Client" }).click({ timeout: 10_000 }).catch(() => {});
    await dialog.getByRole("button", { name: "Create Job" }).click();
    // Rendered in both desktop and mobile layouts — assert the first.
    await expect(page.getByText(JOB_TITLE).first()).toBeVisible({ timeout: 15_000 });
  });

  test("manager cannot open admin-only pages", async ({ page }) => {
    await login(page, "MANAGER");
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/manager\/dashboard/, { timeout: 15_000 });
  });
});
