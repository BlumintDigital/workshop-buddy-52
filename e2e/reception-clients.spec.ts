import { test, expect } from "@playwright/test";
import { account, login } from "./helpers/auth";

// A client walks in who doesn't use the portal: reception saves them as a client while logging
// the machine, picks them from the list on their next visit, and is warned when someone typed
// in as a one-off is already a client.
const STAMP = Date.now();
const NAME = `E2E Walk-in ${STAMP}`;
const EMAIL = `e2e-walkin-${STAMP}@example.test`;
const FIRST = `E2E new client first visit ${STAMP}`;
const SECOND = `E2E new client second visit ${STAMP}`;

test.describe.serial("reception clients", () => {
  test("reception saves a new client while logging their machine", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reception");
    await page.getByRole("radio", { name: "New client" }).click();
    // Garages and some other profiles ask for the person first; others for the company.
    await page.locator("#f-new-client-primary").fill(NAME);
    await page.getByLabel("Phone").fill(`07700 ${String(STAMP).slice(-6)}`);
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    await page.getByLabel("What's come in").fill(FIRST);
    await page.getByRole("radio", { name: /^Approved job/ }).click();
    await page.getByRole("button", { name: "Log project" }).click();
    await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: FIRST, level: 1 })).toBeVisible();
    await expect(page.getByText(NAME).first()).toBeVisible();
  });

  test("next time they're in the client list, marked as not using the portal", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reception");
    await page.getByLabel("Client", { exact: true }).click();
    await page.getByPlaceholder("Search by name, phone or email").fill(EMAIL);
    const option = page.getByRole("option", { name: new RegExp(NAME) });
    await expect(option).toContainText("No portal");
    await option.click();
    await expect(page.getByText("This client doesn't use the portal")).toBeVisible();
    await page.getByLabel("What's come in").fill(SECOND);
    await page.getByRole("radio", { name: /^Approved job/ }).click();
    await page.getByRole("button", { name: "Log project" }).click();
    await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
    await expect(page.getByText(NAME).first()).toBeVisible();
  });

  test("a one-off with an existing client's email is offered their record", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reception");
    await page.getByRole("radio", { name: "One-off" }).click();
    await page.getByLabel("Email (optional)").fill(account("CLIENT").email);
    await expect(page.getByText("is already a client with these details")).toBeVisible();
    await page.getByRole("button", { name: "Use their record" }).click();
    await expect(page.getByRole("radio", { name: "Existing client" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Client", { exact: true })).toContainText("Demo Client");
  });
});
