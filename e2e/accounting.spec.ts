import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// The accounting integration end to end, using the built-in test connector:
// connect it, send an invoice, see it numbered there, pay it there, and see
// Shoplane mark it paid. The same pipeline carries QuickBooks, Xero and the
// webhook connector; only the adapter differs.

const ITEM = `E2E accounting line ${Date.now()}`;

test.describe.serial("accounting integration", () => {
  let invoiceUrl: string;

  test("admin connects the test connection and sets it up", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/settings?tab=integrations");
    await expect(page.getByRole("heading", { name: "Accounting" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Connect test connection" }).click();
    await expect(page.getByText("Test connection connected")).toBeVisible({ timeout: 20_000 });
    const connected = page.getByRole("region", { name: "Connected system" });
    await expect(connected.getByText("Shoplane test books")).toBeVisible();

    // Mapping lists come from the connected system.
    await connected.getByLabel("Product or service").click();
    await page.getByRole("option", { name: "Repairs and servicing" }).click();
    await connected.getByLabel("Who emails the invoice").click();
    await page.getByRole("option", { name: "Test connection" }).click();
    await connected.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Accounting settings saved")).toBeVisible();
    await connected.getByRole("button", { name: "Test connection", exact: true }).click();
    await expect(page.getByText(/Connection works/)).toBeVisible({ timeout: 15_000 });
  });

  test("a sent invoice lands in the connected system with its number", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/invoices/new");
    await page.getByRole("combobox").filter({ hasText: "Select client" }).click();
    await page.getByRole("option", { name: "Demo Client" }).click({ timeout: 10_000 }).catch(() => {});
    await page.getByPlaceholder("Item description").first().fill(ITEM);
    const row = page.getByRole("row").filter({ has: page.getByPlaceholder("Item description") }).first();
    await row.locator("input[type='number']").nth(1).fill("180");
    await expect(async () => {
      await page.getByRole("button", { name: "Save as Draft" }).click();
      await expect(page).not.toHaveURL(/\/invoices\/new/, { timeout: 15_000 });
    }).toPass({ timeout: 45_000 });

    await page.goto("/admin/invoices");
    await page.getByRole("link", { name: /INV-/ }).first().click();
    await expect(page).toHaveURL(/\/invoices\//, { timeout: 15_000 });
    invoiceUrl = new URL(page.url()).pathname;
    await expect(page.getByText("Goes to the test books when you send it")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Send to client" }).click();
    // The connected system emails it, so Shoplane says so instead of sending its own.
    await expect(page.getByText(/email from the test books/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/In the test books as #\d+/)).toBeVisible({ timeout: 20_000 });
  });

  test("a payment made there marks the invoice paid here", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto(invoiceUrl);
    await page.getByRole("button", { name: "Simulate a payment" }).click();
    await expect(page.getByText(/picked it up/i)).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByText("Paid").first()).toBeVisible({ timeout: 15_000 });
  });

  test("the sync log shows the work, and disconnecting stops syncing", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/settings?tab=integrations");
    const log = page.getByRole("table", { name: "Sync log" });
    await expect(log.getByText(/Send INV-/).first()).toBeVisible({ timeout: 15_000 });
    await expect(log.getByText(/Check invoice/).first()).toBeVisible();
    await page.getByRole("region", { name: "Connected system" }).getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("No accounting system is connected")).toBeVisible({ timeout: 15_000 });
  });
});
