import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// The admin creates an invoice for the E2E client, sends it, the client marks
// it paid, and the admin confirms — the full billing round-trip.

test.describe.serial("invoice lifecycle", () => {
  let invoiceUrl: string;

  test("admin creates a draft invoice for the test client", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/invoices/new");

    // Pick the demo client from the dropdown — target the trigger by its
    // placeholder text (Radix renders extra combobox-role elements per select).
    await page.getByRole("combobox").filter({ hasText: "Select client" }).click();
    // Radix detaches the option on selection, which can make Playwright's
    // post-click checks time out even though the click landed — swallow that
    // and assert on the trigger value instead.
    await page.getByRole("option", { name: "Demo Client" }).click({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByRole("combobox").filter({ hasText: "Demo Client" })).toBeVisible();

    await page.getByPlaceholder("Item description").first().fill("E2E service item");
    // hasText can't match typed input values — find the row structurally via
    // its description input instead. Row inputs: [0] = qty, [1] = unit price.
    const itemRow = page
      .getByRole("row")
      .filter({ has: page.getByPlaceholder("Item description") })
      .first();
    await itemRow.locator("input[type='number']").nth(1).fill("250");

    // Success navigates away from the create page (the toast is too ephemeral
    // to assert on reliably); failure keeps us on /invoices/new. Retry once if
    // a slow response swallows the first click.
    await expect(async () => {
      await page.getByRole("button", { name: "Save as Draft" }).click();
      await expect(page).not.toHaveURL(/\/invoices\/new/, { timeout: 15_000 });
    }).toPass({ timeout: 45_000 });
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
    // Assert the durable banner rather than the ephemeral toast.
    await expect(page.getByText(/you've let us know you paid/i)).toBeVisible({ timeout: 20_000 });
  });

  test("admin confirms payment received", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto(invoiceUrl);

    await page.getByRole("button", { name: "Confirm payment received" }).first().click();
    // Status flips to "paid" once the update lands ("paid" appears in both
    // the badge and the status dropdown — either confirms success).
    await expect(page.getByText("paid", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  });
});
