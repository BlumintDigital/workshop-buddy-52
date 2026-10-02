import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { logProjectAtReception } from "./helpers/projects";

// Quote approval by link: a walk-in customer with no account opens the link, sees the quote and
// approves it; the workshop's project moves to Approved and records who approved it.
const STAMP = Date.now();
const PROJECT = `E2E quote link ${STAMP}`;
let link = "";

test.describe.serial("quote approval by link", () => {
  test("the workshop sends a quote and copies a link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page, "ADMIN");
    await logProjectAtReception(page, PROJECT, { intake: "Quote" });
    await page.getByRole("button", { name: "New quote" }).click();
    const editor = page.getByRole("dialog");
    await editor.getByLabel("Title").fill("E2E gearbox overhaul");
    await editor.getByLabel("Line 1 description").fill("E2E seals and bearings");
    await editor.getByLabel("Line 1 price").fill("240");
    await editor.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Send to client" }).click();
    await expect(page.getByText("Waiting for client").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Share link" }).click();
    const share = page.getByRole("dialog");
    await share.getByRole("button", { name: "Copy a link" }).click();
    const field = share.getByLabel("Quote link");
    await expect(field).toHaveValue(/\/q\/[A-Za-z0-9_-]{20,}$/, { timeout: 15_000 });
    link = await field.inputValue();
  });

  test("the customer approves it without an account", async ({ browser }) => {
    const guest = await browser.newContext();
    const page = await guest.newPage();
    await page.goto(new URL(link).pathname);
    await expect(page.getByRole("heading", { name: "E2E gearbox overhaul" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("E2E seals and bearings")).toBeVisible();
    await page.getByRole("button", { name: /^Approve/ }).click();
    await expect(page.getByText("Type your name to confirm.")).toBeVisible();
    await page.getByLabel("Your name").fill("Pat Walker");
    await page.getByRole("button", { name: /^Approve/ }).click();
    await expect(page.getByText("Quote approved")).toBeVisible({ timeout: 15_000 });

    // The link can't be used twice.
    await page.reload();
    await expect(page.getByText("Quote approved")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Approve/ })).toHaveCount(0);
    await guest.close();
  });

  test("the project is approved and shows who approved it", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/projects");
    await page.getByRole("searchbox", { name: /search by project id or title/i }).fill(PROJECT);
    await page.getByRole("link", { name: new RegExp(PROJECT) }).first().click();
    await expect(page.getByText("Accepted").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/accepted by link: Pat Walker/)).toBeVisible();
    await expect(page.getByText(/By link: Pat Walker/)).toBeVisible();
  });

  test("a made-up link shows that it doesn't work", async ({ browser }) => {
    const guest = await browser.newContext();
    const page = await guest.newPage();
    await page.goto("/q/not-a-real-link-0000000000000000");
    await expect(page.getByText("This link no longer works")).toBeVisible({ timeout: 20_000 });
    await guest.close();
  });
});
