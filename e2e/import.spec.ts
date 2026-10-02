import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// CSV import: clients, then stock, then machines linked to the imported client, each from a
// file with the workshop's own column names; a second run skips what's already there.
const STAMP = Date.now();
const EMAIL = `e2e.import.${STAMP}@example.com`;
const COMPANY = `E2E Import Co ${STAMP}`;
const SKU = `E2E-SKU-${STAMP}`;
const SERIAL = `E2E-IMP-${STAMP}`;

const csv = (lines: string[]) => ({ name: "data.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\r\n")) });

test.describe.serial("CSV import", () => {
  test("imports clients, stock and machines, and skips repeats", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/import");
    await expect(page.getByRole("heading", { name: "Import and export" })).toBeVisible({ timeout: 15_000 });

    // Clients: one good row, one with a bad email.
    await page.getByLabel("Upload Clients CSV").setInputFiles(csv([
      "Company,Contact,Email,Phone",
      `${COMPANY},Jo Import,${EMAIL},0161 000 0000`,
      "Broken Ltd,,not-an-email,",
    ]));
    await expect(page.getByText("1 ready")).toBeVisible();
    await expect(page.getByText(/Line 3: Email isn't an email address/)).toBeVisible();
    await page.getByRole("button", { name: "Import 1 row" }).click();
    await expect(page.getByText(/1\s*imported/).first()).toBeVisible({ timeout: 30_000 });

    // Stock, using other column names people use.
    await page.getByLabel("Upload Stock CSV").setInputFiles(csv([
      "Item,Part number,Qty,Cost,Vendor",
      `E2E import bearing ${STAMP},${SKU},12,3.5,E2E Import Supplier ${STAMP}`,
    ]));
    await page.getByRole("button", { name: "Import 1 row" }).click();
    await expect(page.getByText(/1\s*imported/).nth(1)).toBeVisible({ timeout: 30_000 });

    // Machines, owned by the client imported above, with a service reminder.
    await page.getByLabel("Upload Machines CSV").setInputFiles(csv([
      "Owner email,Name,Make and model,Serial number,Hours,Service,Service due,Service every (months)",
      `${EMAIL},E2E imported lathe,Colchester Student,${SERIAL},900,Annual service,31/01/2027,12`,
    ]));
    await page.getByRole("button", { name: "Import 1 row" }).click();
    await expect(page.getByText(/1\s*imported/).nth(2)).toBeVisible({ timeout: 30_000 });

    // The same stock file again is skipped.
    await page.getByLabel("Upload Stock CSV").setInputFiles(csv([
      "Name,SKU,Quantity",
      `E2E import bearing ${STAMP},${SKU},12`,
    ]));
    await page.getByRole("button", { name: "Import 1 row" }).click();
    await expect(page.getByText(/1 skipped/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("the imported machine is in the register with its owner and reminder", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/assets");
    await page.getByRole("searchbox").fill(SERIAL);
    await page.getByRole("link", { name: new RegExp(SERIAL) }).first().click();
    await expect(page.getByRole("heading", { name: "E2E imported lathe", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(COMPANY).first()).toBeVisible();
    await expect(page.getByText("Annual service")).toBeVisible();
    await expect(page.getByText(/31 Jan 2027|Jan 31, 2027/)).toBeVisible();
  });
});
