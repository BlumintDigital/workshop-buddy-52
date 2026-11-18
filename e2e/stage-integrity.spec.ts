import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { apiAsUser, logProjectAtReception, projectIdFromUrl } from "./helpers/projects";

// A project's stage only moves through the stage functions on the server, which check
// the current stage first. Stage names can't be used as task titles.
const STAMP = Date.now();
const STAGE_MESSAGE = "Quality check and shipping are stages, not tasks. They start automatically when every task is handed off.";

async function addTask(page: Page, title: string) {
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible({ timeout: 15_000 });
}

async function handOff(page: Page, title: string) {
  const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: title, exact: true }) });
  await row.getByRole("button", { name: "Hand off" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What was done").fill(`E2E: ${title} done.`);
  await dialog.getByRole("button", { name: "Hand off" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test.describe("stage integrity", () => {
  test("a task named after a stage is refused", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, `E2E stage-named task ${STAMP}`);
    await page.getByRole("button", { name: "Add task" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Task", { exact: true }).fill("Shipping");
    await expect(dialog.getByRole("alert")).toHaveText(STAGE_MESSAGE);
    await expect(dialog.getByRole("button", { name: "Add task" })).toBeDisabled();
    await dialog.getByLabel("Task", { exact: true }).fill("Inspect brakes");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // The server refuses it too.
    const res = await apiAsUser(page, "POST", "job_tasks", { job_id: projectIdFromUrl(page), title: " quality CHECK " });
    expect(res.ok(), "a stage-named task should be refused").toBe(false);
    expect((await res.json()).message).toBe(STAGE_MESSAGE);
  });

  test("deleting the last open task sends the project to its quality check", async ({ page }) => {
    const done = `E2E strip down ${STAMP}`;
    const extra = `E2E spare task ${STAMP}`;
    await login(page, "ADMIN");
    await logProjectAtReception(page, `E2E delete last task ${STAMP}`);
    await addTask(page, done);
    await addTask(page, extra);
    await handOff(page, done);
    await page.getByRole("button", { name: `More actions for ${extra}` }).click();
    await page.getByRole("menuitem", { name: "Delete task" }).click();
    await expect(page.getByRole("button", { name: "Pass quality check" })).toBeVisible({ timeout: 15_000 });
  });

  test("a direct stage change is refused", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, `E2E direct update ${STAMP}`);
    const id = projectIdFromUrl(page);
    const res = await apiAsUser(page, "PATCH", `jobs?id=eq.${id}`, { status: "completed" });
    expect(res.ok(), "skipping the quality check should be refused").toBe(false);
    const rows = await (await apiAsUser(page, "GET", `jobs?id=eq.${id}&select=status`)).json();
    expect(rows[0].status).toBe("pending");
    // Other details can still be edited.
    const edit = await apiAsUser(page, "PATCH", `jobs?id=eq.${id}`, { priority: "high" });
    expect(edit.ok()).toBe(true);
  });

  test("rework loop: send back, rework, hand off, back to the quality check", async ({ page }) => {
    const task = `E2E align shaft ${STAMP}`;
    await login(page, "ADMIN");
    await logProjectAtReception(page, `E2E rework loop ${STAMP}`);
    await addTask(page, task);
    await handOff(page, task);

    await page.getByRole("button", { name: "Send back for rework" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(task).check();
    await dialog.getByLabel("What needs fixing").fill("E2E: runout too high");
    await dialog.getByRole("button", { name: "Send back" }).click();
    await expect(page.getByRole("button", { name: `Rework: ${task}`, exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Pass quality check" })).toHaveCount(0);

    await handOff(page, `Rework: ${task}`);
    await page.getByRole("button", { name: "Pass quality check" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText("Pass the quality check?")).toBeVisible();
    await confirm.getByRole("button", { name: "Pass quality check" }).click();
    await expect(page.getByText(/shipping has been told/i)).toBeVisible({ timeout: 15_000 });

    // A second press after it worked is harmless.
    const again = await apiAsUser(page, "POST", "rpc/quality_check", { _job_id: projectIdFromUrl(page), _pass: true });
    expect(again.ok()).toBe(true);
    expect(await again.json()).toBe("completed");
  });

  test("close a project", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, `E2E close project ${STAMP}`, { intake: "Evaluation" });
    await page.getByRole("button", { name: "Close project" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/reason/i).fill("E2E: client declined");
    await dialog.getByRole("button", { name: "Close project" }).click();
    await expect(page.getByText("Project closed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Closed: E2E: client declined").first()).toBeVisible({ timeout: 15_000 });

    const id = projectIdFromUrl(page);
    const again = await apiAsUser(page, "POST", "rpc/close_project", { _job_id: id });
    expect(again.ok()).toBe(true);
    const rows = await (await apiAsUser(page, "GET", `jobs?id=eq.${id}&select=status`)).json();
    expect(rows[0].status).toBe("cancelled");
  });

  test("approve without a quote", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, `E2E approve without quote ${STAMP}`, { intake: "Quote" });
    await page.getByRole("button", { name: "Approve without a quote" }).click();
    await expect(page.getByText("Approved. It's ready to plan.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Split the work into team tasks below/)).toBeVisible({ timeout: 15_000 });
  });
});
