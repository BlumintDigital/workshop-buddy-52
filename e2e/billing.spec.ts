import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// Invoices are for admins, managers and staff given the Billing permission.
test("staff without Billing are told they need it", async ({ page }) => {
  await login(page, "STAFF");
  await page.goto("/invoices");
  await expect(page.getByText("You don't have billing access")).toBeVisible({ timeout: 15_000 });
  // No menu link to invoices (the breadcrumb for this page is not a link).
  await expect(page.locator(`a[href="/invoices"]`)).toHaveCount(0);
});

test("the invoices list opens filtered from a link", async ({ page }) => {
  await login(page, "ADMIN");
  await page.goto("/invoices?status=draft");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible({ timeout: 15_000 });
});
