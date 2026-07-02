import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

const ITEM_NAME = `E2E part ${Date.now()}`;

test.describe.serial("inventory", () => {
  test("admin adds an item that starts in stock", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/inventory");

    await page.getByRole("button", { name: "Add Item" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add Inventory Item")).toBeVisible();

    // Field order: Name, SKU, Category (text) then Quantity, Min Stock, Unit Cost (number).
    await dialog.getByRole("textbox").nth(0).fill(ITEM_NAME);
    await dialog.getByRole("textbox").nth(1).fill("E2E-SKU");
    const numberInputs = dialog.locator("input[type='number']");
    await numberInputs.nth(0).fill("10"); // quantity
    await numberInputs.nth(1).fill("3"); // min stock
    await numberInputs.nth(2).fill("4.5"); // unit cost

    await dialog.getByRole("button", { name: "Add Item" }).click();

    const row = page.getByRole("row").filter({ hasText: ITEM_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("In Stock")).toBeVisible();
  });

  test("stock-out below min stock flips the row to Low Stock", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/inventory");

    const row = page.getByRole("row").filter({ hasText: ITEM_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Open the row's actions dropdown (last button in the row).
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Adjust Stock" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/adjust stock/i)).toBeVisible();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /stock out/i }).click({ timeout: 10_000 }).catch(() => {});
    await dialog.locator("input[type='number']").fill("8");
    await dialog.getByRole("button", { name: "Save" }).click();

    // 10 - 8 = 2, min stock 3 → low.
    await expect(row.getByText("Low Stock")).toBeVisible({ timeout: 15_000 });
  });

  test("staff sees the item read-only with a Low badge and Log Usage", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto("/staff/inventory");

    const row = page.getByRole("row").filter({ hasText: ITEM_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Low", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Log Usage" })).toBeVisible();
    // No admin-only controls for staff.
    await expect(page.getByRole("button", { name: "Add Item" })).toHaveCount(0);
  });

  test("admin deletes the item (cleanup)", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/inventory");

    const row = page.getByRole("row").filter({ hasText: ITEM_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Delete uses a native confirm() dialog.
    page.on("dialog", (d) => void d.accept());
    await row.getByRole("button").last().click();
    await page.getByRole("menuitem", { name: "Delete Item" }).click();

    await expect(page.getByRole("row").filter({ hasText: ITEM_NAME })).toHaveCount(0, { timeout: 15_000 });
  });
});
