import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { logProjectAtReception, openProjectAsAdmin } from "./helpers/projects";

// Teams, team-assigned tasks and handoffs, end to end:
// admin builds a team and a project, the technician picks the task up on My day
// and hands it off, and the project moves to its quality check.

const STAMP = Date.now();
const TEAM = `E2E Fabrication ${STAMP}`;
const PROJECT = `E2E team project ${STAMP}`;
const TASK = `Weld bracket ${STAMP}`;

test.describe.serial("teams and handoffs", () => {
  test("admin creates a team and adds the technician", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/teams");
    await page.getByRole("button", { name: "New team" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(TEAM);
    await dialog.getByRole("button", { name: "Create team" }).click();
    const card = page.locator("div.rounded-lg", { has: page.getByText(TEAM, { exact: true }) }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("combobox", { name: new RegExp(`Add a person to ${TEAM}`) }).click();
    await page.getByRole("option", { name: "Demo Staff" }).click();
    await expect(card.getByText("Demo Staff")).toBeVisible({ timeout: 15_000 });
  });

  test("admin creates a project and gives the team a task", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, PROJECT);
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task", { exact: true }).fill(TASK);
    await dialog.getByLabel("Team").click();
    await page.getByRole("option", { name: TEAM }).click();
    await dialog.getByLabel("Person").click();
    await page.getByRole("option", { name: "Demo Staff" }).click();
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("button", { name: TASK, exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: TEAM })).toBeVisible();
  });

  test("technician starts and hands off the task from My day", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto("/staff/dashboard");
    const inHand = page.getByRole("region", { name: "Task in hand" });
    await expect(page.getByText(TASK, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    // The new task is either the one in hand (plain button names) or in the list below (names include the task).
    const isInHand = (await inHand.getByText(TASK, { exact: true }).count()) > 0;
    const startButton = isInHand ? inHand.getByRole("button", { name: "Start" }) : page.getByRole("button", { name: `Start ${TASK}` });
    await startButton.click();
    await expect(page.getByText(`Started: ${TASK}`)).toBeVisible({ timeout: 15_000 });

    const stillInHand = (await inHand.getByText(TASK, { exact: true }).count()) > 0;
    const handOffButton = stillInHand ? inHand.getByRole("button", { name: "Hand off" }) : page.getByRole("button", { name: `Hand off ${TASK}` });
    await handOffButton.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What was done").fill("E2E: bracket welded and ground flush.");
    await dialog.getByLabel("Hours spent (optional)").fill("1.5");
    await dialog.getByRole("button", { name: "Hand off" }).click();
    await expect(page.getByText(/handed off/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("admin sees the handoff and the quality check", async ({ page }) => {
    await login(page, "ADMIN");
    await openProjectAsAdmin(page, PROJECT);
    await expect(page.getByText("E2E: bracket welded and ground flush.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/handed off by demo staff/i)).toBeVisible();
    await expect(page.getByText("Quality check").first()).toBeVisible();
    await expect(page.getByText("1.5 h").first()).toBeVisible();
  });

  test("admin deletes the test team", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/teams");
    await page.getByRole("button", { name: `Actions for ${TEAM}` }).click();
    await page.getByRole("menuitem", { name: "Delete team" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete team" }).click();
    await expect(page.getByText(TEAM, { exact: true })).toHaveCount(0, { timeout: 15_000 });
  });
});
