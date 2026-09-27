import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// The reports page: profit and loss by project, saved reports, team and trends.
const REPORT = `E2E report ${Date.now()}`;

test.describe.serial("reports", () => {
  test("the old reports link opens the new page", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/reports");
    await expect(page).toHaveURL(/\/reports/);
    await expect(page.getByRole("tab", { name: "Profit and loss" })).toBeVisible({ timeout: 15_000 });
  });

  test("a manager builds, saves, reopens and deletes a profit and loss report", async ({ page }) => {
    await login(page, "MANAGER");
    await page.goto("/reports");
    const table = page.getByRole("table", { name: "Profit and loss by project" });
    await expect(table.or(page.getByText("No projects match"))).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Projects at a loss")).toBeVisible();

    // Widen the dates so there is something to group, then group by client.
    await page.getByLabel("Received from").fill("2020-01-01");
    await page.getByLabel("Group by").click();
    await page.getByRole("option", { name: "Client" }).click();
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.getByRole("rowheader", { name: /^Total \(\d+\)$/ })).toBeVisible();

    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Hours", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(table.getByRole("columnheader", { name: "Hours", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save report" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(REPORT);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`"${REPORT}" saved`)).toBeVisible();

    await expect(page).toHaveURL(/report=/);
    // Reopening the saved link brings the settings back.
    await page.reload();
    await expect(page.getByLabel("Received from")).toHaveValue("2020-01-01", { timeout: 15_000 });
    await expect(table.getByRole("columnheader", { name: "Hours", exact: true })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: `Delete saved report ${REPORT}` }).click();
    await expect(page.getByText(`"${REPORT}" deleted`)).toBeVisible();
  });

  test("team and trends tabs load", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reports?tab=team");
    await expect(page.getByRole("table", { name: "Team performance" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: "Trends" }).click();
    await expect(page.getByText("Revenue", { exact: true }).first()).toBeVisible();
  });

  test("staff without reports access are told so", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto("/reports");
    await expect(page.getByText(/don't have reports access|Profit and loss/).first()).toBeVisible({ timeout: 15_000 });
  });
});
