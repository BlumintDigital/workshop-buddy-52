import { test, expect } from "@playwright/test";
import { login, account } from "./helpers/auth";

// The admin creates an invoice for the E2E client, sends it, the client marks
// it paid, and the admin confirms — the full billing round-trip.

test.describe.serial("invoice lifecycle", () => {
  let invoiceUrl: string;

  test("admin creates a draft invoice for the test client", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/invoices/new");

    // Pick the E2E client from the dropdown (matched by its account name/email).
    await page.getByRole("combobox").first().click();
    const clientEmail = account("CLIENT").email;
    const namePart = clientEmail.split("@")[0];
    await page
      .getByRole("option")
      .filter({ hasText: new RegExp(namePart.replace(/[+.]/g, "\\$&"), "i") })
      .first()
      .click();

    await page.getByPlaceholder("Item description").first().fill("E2E service item");
    // Line item inputs: [0] = qty, [1] = unit price (tax rate sits in its own card above).
    const itemRow = page.getByRole("row").filter({ hasText: "E2E service item" });
    await itemRow.locator("input[type='number']").nth(1).fill("250");

    await page.getByRole("button", { name: "Save as Draft" }).click();
    await expect(page.getByText("Invoice created as draft")).toBeVisible();
  });

  test("admin opens the draft and sends it to the client", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/invoices");

    // Open the most recent invoice (top of the list).
    await page.getByRole("link", { name: /INV-/ }).first().click();
    await expect(page).toHaveURL(/\/invoices\//, { timeout: 15_000 });
    invoiceUrl = new URL(page.url()).pathname;

    await page.getByRole("button", { name: "Send to client" }).click();
    await expect(page.getByText(/client notified via/i)).toBeVisible({ timeout: 30_000 });
  });

  test("client sees the invoice and marks it paid", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto(invoiceUrl);

    await expect(page.getByText("Awaiting payment")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "I've paid" }).click();
    await expect(page.getByText(/we'll confirm shortly/i)).toBeVisible();
  });

  test("admin confirms payment received", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto(invoiceUrl);

    await page.getByRole("button", { name: "Confirm payment received" }).first().click();
    await expect(page.getByText("Marked as paid.")).toBeVisible();
    await expect(page.getByText("paid", { exact: true })).toBeVisible();
  });
});
