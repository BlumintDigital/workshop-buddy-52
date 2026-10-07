import { test, expect } from "@playwright/test";
import { account, login } from "./helpers/auth";
import { logProjectAtReception } from "./helpers/projects";

// Staff can't read other people's profiles, but a project page still names its client and
// project lead for anyone who can see the project.
const STAMP = Date.now();
const PROJECT = `E2E people project ${STAMP}`;
const TASK = `Strip down ${STAMP}`;
let projectUrl = "";

test.describe.serial("people on a project page", () => {
  test("admin logs a project for Demo Client and gives the technician's team a task", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, PROJECT, { client: "Demo Client" });
    projectUrl = page.url();
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task", { exact: true }).fill(TASK);
    await dialog.getByLabel("Team").click();
    await page.getByRole("option", { name: "Workshop floor" }).click();
    await dialog.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("button", { name: TASK, exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("the technician sees the client's name and contact details", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: PROJECT, level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("project-client")).toHaveText("Demo Client");
    await expect(page.getByRole("link", { name: account("CLIENT").email })).toBeVisible();
  });

  test("admin makes the technician project lead", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: PROJECT, level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Project lead").click();
    await page.getByRole("option", { name: "Demo Staff" }).click();
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Project updated")).toBeVisible();
  });

  test("the technician sees themselves as project lead", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto(projectUrl);
    await expect(page.getByTestId("project-lead")).toHaveText("Demo Staff", { timeout: 20_000 });
    await expect(page.getByTestId("project-client")).toHaveText("Demo Client");
  });
});
