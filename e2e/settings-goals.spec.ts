import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe.serial("settings and goals", () => {
  test("admin edits and saves a settings field, then restores it", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/settings");

    const phone = page.locator("#phone");
    await expect(phone).toBeVisible({ timeout: 15_000 });
    const original = await phone.inputValue();

    await phone.fill("+44 700 900 1234");
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved — invoices and PDFs will refresh")).toBeVisible({ timeout: 15_000 });

    // Persisted across reload?
    await page.reload();
    await expect(page.locator("#phone")).toHaveValue("+44 700 900 1234", { timeout: 15_000 });

    // Restore the original value so the test leaves no trace.
    await page.locator("#phone").fill(original);
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved — invoices and PDFs will refresh")).toBeVisible({ timeout: 15_000 });
  });

  test("monthly goal is set once and locks for the month", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/settings");
    await page.getByRole("tab", { name: "Billing" }).click();

    const locked = page.getByText("Locked").first();
    const setGoalButton = page.getByRole("button", { name: "Set Goal" });

    // Goals load asynchronously — wait until either state renders, then branch.
    await expect(locked.or(setGoalButton).first()).toBeVisible({ timeout: 20_000 });
    if (await locked.isVisible().catch(() => false)) {
      await expect(locked).toBeVisible();
    } else if (await setGoalButton.isVisible().catch(() => false)) {
      await page.getByPlaceholder(/set goal for/i).fill("5000");
      await setGoalButton.click();
      await expect(page.getByText("Goal set for this month")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Locked")).toBeVisible({ timeout: 15_000 });
    } else {
      throw new Error("Neither a Locked badge nor a Set Goal button found on the Billing tab");
    }
  });

  test("goals page renders the monthly goal for admin", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/goals");
    await expect(page.getByText("This Month", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/% of monthly goal|Goal reached!/)).toBeVisible();
  });
});
