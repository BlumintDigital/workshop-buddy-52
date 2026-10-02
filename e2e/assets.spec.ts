import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// The asset register end to end: reception saves a client's machine with its first project,
// a reminder comes due from the meter reading and is marked done, a repeat visit is found by
// serial number and joins the history, and the client books a service from their portal.
const STAMP = Date.now();
const SERIAL = `E2E-SN-${STAMP}`;
const FIRST = `E2E asset first visit ${STAMP}`;
const SECOND = `E2E asset second visit ${STAMP}`;

test.describe.serial("asset register", () => {
  test("reception saves the client's machine with its first project", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reception");
    await page.getByLabel("Client", { exact: true }).click();
    await page.getByRole("option", { name: /Demo Client/ }).first().click();
    await page.getByLabel("What's come in").fill(FIRST);
    await page.getByLabel("Make and model").fill("Colchester Student 1800");
    await page.getByLabel("Serial or asset number").fill(SERIAL);
    await page.getByLabel("Running hours (optional)").fill("1200");
    await expect(page.getByRole("checkbox", { name: /Save to the customer's machines/ })).toBeChecked();
    await page.getByRole("radio", { name: /^Approved job/ }).click();
    await page.getByRole("button", { name: "Log project" }).click();
    await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });

    await page.getByRole("link", { name: "Service history" }).click();
    await expect(page.getByRole("heading", { name: "Colchester Student 1800", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(SERIAL).first()).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(FIRST) })).toBeVisible();
    await expect(page.getByText("1,200 hours").first()).toBeVisible();
  });

  test("a reminder comes due from the reading and rolls forward when done", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/assets");
    await page.getByRole("searchbox").fill(SERIAL);
    await page.getByRole("link", { name: new RegExp(SERIAL) }).first().click();

    await page.getByRole("button", { name: "Add reminder" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Service every 500 hours" }).click();
    await expect(dialog.getByLabel("or at (hours)")).toHaveValue("1700");
    await dialog.getByRole("button", { name: "Save reminder" }).click();
    await expect(page.getByText("Service every 500 hours")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();

    // At 1,690 hours it's within 10% of the next service.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Update reading" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reading in hours").fill("1690");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Due soon", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Mark done" }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Reading (hours)")).toHaveValue("1690");
    await dialog.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText(/at 2,190 hours/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Scheduled", { exact: true })).toBeVisible();
  });

  test("a repeat visit is found by serial number and joins the history", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reception");
    await page.getByPlaceholder(/Find a machine by serial/).fill(SERIAL);
    await page.getByRole("button", { name: new RegExp(SERIAL) }).click();
    await expect(page.getByText(/Linked to/)).toBeVisible();
    await page.getByLabel("What's come in").fill(SECOND);
    await page.getByRole("radio", { name: /^Evaluation/ }).click();
    await page.getByRole("button", { name: "Log project" }).click();
    await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole("link", { name: "Service history" }).click();
    await expect(page.getByText(/Service history · 2 projects/)).toBeVisible({ timeout: 15_000 });
  });

  test("the client sees the machine and books a service", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/assets");
    await page.getByRole("link", { name: new RegExp(SERIAL) }).click();
    await expect(page.getByRole("heading", { name: "Colchester Student 1800", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Service history · 2 projects/)).toBeVisible();
    await page.getByRole("button", { name: "Request a service" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Title")).toHaveValue(/Colchester Student 1800/);
    await dialog.getByRole("button", { name: /Submit|Send/ }).click();
    await expect(page.getByText(/The workshop has your request|request submitted/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
