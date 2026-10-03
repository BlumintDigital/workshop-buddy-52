import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

// Saves the settings form. If the save is refused, fails with the error toast's text rather
// than a bare timeout, so a CI failure says why.
async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  const saved = page.getByText("Settings saved — invoices and PDFs will refresh");
  const refused = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(saved.or(refused)).toBeVisible({ timeout: 15_000 });
  if (await refused.isVisible()) throw new Error(`Settings save failed: ${await refused.innerText()}`);
}

test.describe.serial("settings and goals", () => {
  test("admin edits and saves a settings field, then restores it", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/settings");

    const phone = page.locator("#phone");
    await expect(phone).toBeVisible({ timeout: 15_000 });
    const original = await phone.inputValue();

    await phone.fill("+44 700 900 1234");
    await save(page);

    // Persisted across reload?
    await page.reload();
    await expect(page.locator("#phone")).toHaveValue("+44 700 900 1234", { timeout: 15_000 });

    // Restore the original value so the test leaves no trace.
    await page.locator("#phone").fill(original);
    await save(page);
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
    await expect(page.getByRole("heading", { name: "Goals", level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/% of the monthly goal|Goal reached/).first()).toBeVisible();
  });
});
