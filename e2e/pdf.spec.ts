import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// Uses invoices/jobs created by earlier E2E runs (there is always at least one
// invoice by the time this file runs — the suite executes invoice-flow first
// alphabetically... actually i < p, so invoice-flow runs before pdf).

test.describe.serial("PDF generation", () => {
  let invoiceUrl: string;

  test("invoice PDF button triggers a real download", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/invoices");
    await page.getByRole("link", { name: /INV-/ }).first().click();
    await expect(page).toHaveURL(/\/invoices\//, { timeout: 15_000 });
    invoiceUrl = new URL(page.url()).pathname;

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByRole("button", { name: "PDF", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^INV-.*\.pdf$/);
  });

  test("a PDF version can be saved and listed", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto(invoiceUrl);

    await page.getByRole("button", { name: "Save PDF version" }).click();
    await expect(page.getByText(/saved version v\d+/i)).toBeVisible({ timeout: 30_000 });
    // The stored version opens via a signed URL (not a download event) — assert
    // the version row and its Download control instead.
    await expect(page.getByRole("button", { name: "Download" }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("job report button triggers a download", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/jobs");
    // Open the most recent E2E job (created by request-flow or manager spec).
    await page.getByText(/E2E (request|manager job)/).first().click();
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByRole("button", { name: /report/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^job-report-.*\.pdf$/);
  });
});
