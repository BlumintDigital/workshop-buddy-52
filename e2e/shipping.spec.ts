import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { logProjectAtReception, openProjectAsAdmin } from "./helpers/projects";

// From quality check to collection: the project passes QC, shipping tells the
// client, the client chooses to collect, and shipping records the handover.
const PROJECT = `E2E shipping project ${Date.now()}`;

test.describe.serial("shipping", () => {
  test("a project passes its quality check and joins the shipping queue", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, PROJECT, { client: "Demo Client" });
    // Admins can move the stage by hand; take it straight to the quality check.
    await page.getByLabel("Status").click();
    await page.getByRole("option", { name: "Quality check" }).click();
    await expect(page.getByText(/status changed to quality check/i)).toBeVisible();
    await page.getByRole("button", { name: "Pass quality check" }).click();
    await expect(page.getByText(/shipping has been told/i)).toBeVisible();
    await expect(page.getByText("Ready, client not told yet")).toBeVisible({ timeout: 15_000 });
  });

  test("shipping tells the client it's ready", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/shipping");
    const card = page.getByRole("listitem").filter({ hasText: PROJECT });
    await card.getByRole("button", { name: "Tell the client" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Tell the client" }).click();
    await expect(page.getByText(/client has been told/i)).toBeVisible();
  });

  test("the client chooses to collect", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/projects");
    await page.getByRole("searchbox").fill(PROJECT);
    await page.getByRole("link", { name: new RegExp(PROJECT) }).first().click();
    await page.getByRole("button", { name: "Choose collection or delivery" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /collect it/i }).click();
    await dialog.getByLabel(/who's collecting/i).fill("E2E driver Sam");
    await dialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/collection arranged/i)).toBeVisible();
  });

  test("shipping records the collection and the project is shipped", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/shipping");
    await page.getByRole("radio", { name: /arranged/i }).click();
    const card = page.getByRole("listitem").filter({ hasText: PROJECT });
    await expect(card.getByText('"E2E driver Sam"')).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "Hand over" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Collected by").fill("E2E driver Sam");
    await dialog.getByLabel("Registration").fill("e2e 123");
    await dialog.getByRole("button", { name: "Mark as collected" }).click();
    await expect(page.getByText(/collected$/i).first()).toBeVisible({ timeout: 15_000 });

    await openProjectAsAdmin(page, PROJECT);
    await expect(page.getByText("Shipped").first()).toBeVisible();
    await expect(page.getByText(/E2E driver Sam · .*E2E 123/)).toBeVisible();
  });

  test("the client sees it was collected", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/projects");
    await page.getByRole("searchbox").fill(PROJECT);
    await page.getByRole("link", { name: new RegExp(PROJECT) }).first().click();
    await expect(page.getByRole("heading", { name: "Collected" })).toBeVisible({ timeout: 15_000 });
  });
});
