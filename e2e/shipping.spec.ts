import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { logProjectAtReception, openProjectAsAdmin } from "./helpers/projects";

// From quality check to collection: the project passes QC, shipping tells the
// client, the client chooses to collect, and shipping records the handover.
const PROJECT = `E2E shipping project ${Date.now()}`;
const TASK = `Final assembly ${Date.now()}`;

test.describe.serial("shipping", () => {
  test("a project is logged and its work is given to the technician", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, PROJECT, { client: "Demo Client" });
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task", { exact: true }).fill(TASK);
    await dialog.getByLabel("Person").click();
    await page.getByRole("option", { name: "Demo Staff" }).click();
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("button", { name: TASK, exact: true })).toBeVisible({ timeout: 15_000 });
    // The Status menu can only move back or cancel; forward moves use the stage buttons.
    await page.getByLabel("Status").click();
    await expect(page.getByRole("option", { name: /quality check|ready to ship|shipped/i })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("handing off the last task sends the project to its quality check", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto("/staff/dashboard");
    const inHand = page.getByRole("region", { name: "Task in hand" });
    await expect(page.getByText(TASK, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    const isInHand = (await inHand.getByText(TASK, { exact: true }).count()) > 0;
    await (isInHand ? inHand.getByRole("button", { name: "Start" }) : page.getByRole("button", { name: `Start ${TASK}` })).click();
    await expect(page.getByText(`Started: ${TASK}`)).toBeVisible({ timeout: 15_000 });
    const stillInHand = (await inHand.getByText(TASK, { exact: true }).count()) > 0;
    await (stillInHand ? inHand.getByRole("button", { name: "Hand off" }) : page.getByRole("button", { name: `Hand off ${TASK}` })).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What was done").fill("E2E: assembled and run-tested.");
    await dialog.getByRole("button", { name: "Hand off" }).click();
    await expect(page.getByText(/handed off/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("the project passes its quality check and joins the shipping queue", async ({ page }) => {
    await login(page, "ADMIN");
    await openProjectAsAdmin(page, PROJECT);
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
    await expect(page.getByText(/^[A-Z]+-\d{6}-\d{3} collected$/)).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden();

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
