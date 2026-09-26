import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";
import { logProjectAtReception, openProjectAsAdmin } from "./helpers/projects";

// Stores end to end: stock and supplier, a parts request from a project,
// issuing from stock, ordering what isn't stocked, approving, receiving and
// issuing it, and the cost landing on the project.
const STAMP = Date.now();
const ITEM = `E2E bearing ${STAMP}`;
const MISSING = `E2E motor ${STAMP}`;
const SUPPLIER = `E2E Supplies ${STAMP}`;
const PROJECT = `E2E parts project ${STAMP}`;

test.describe.serial("inventory portal", () => {
  test("stores adds a supplier and a stock item", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/inventory/suppliers");
    await page.getByRole("button", { name: "Add supplier" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(SUPPLIER);
    await dialog.getByRole("button", { name: "Add supplier" }).click();
    await expect(page.getByText(SUPPLIER, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "Stock" }).click();
    await page.getByRole("button", { name: "Add item" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(ITEM);
    await dialog.getByLabel("Unit cost").fill("4.5");
    await dialog.getByLabel("Opening stock").fill("10");
    await dialog.getByLabel("Reorder when at or below").fill("3");
    await dialog.getByLabel("Supplier").click();
    await page.getByRole("option", { name: SUPPLIER }).click();
    await dialog.getByRole("button", { name: "Add item" }).click();
    await page.getByRole("searchbox").fill(ITEM);
    await expect(page.getByText("In stock", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("the team requests parts from a project", async ({ page }) => {
    await login(page, "ADMIN");
    await logProjectAtReception(page, PROJECT);
    await page.getByRole("button", { name: "Request parts" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Part 1" }).click();
    await page.getByRole("option", { name: new RegExp(ITEM) }).click();
    await dialog.getByLabel("Part 1 quantity").fill("8");
    await dialog.getByRole("button", { name: "Add another part" }).click();
    await dialog.getByRole("combobox", { name: "Part 2" }).click();
    await page.getByRole("option", { name: /not in stock/i }).click();
    await dialog.getByLabel("Part 2 description").fill(MISSING);
    await dialog.getByRole("button", { name: "Send to stores" }).click();
    await expect(page.getByText(/sent to stores/i)).toBeVisible();
    await expect(page.getByText("Waiting for stores").first()).toBeVisible({ timeout: 15_000 });
  });

  test("stores issues the stocked part and it drops to low stock", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/inventory");
    await page.getByRole("button", { name: `Issue ${ITEM}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Issue parts" }).click();
    await expect(page.getByText(/^Issued 8/)).toBeVisible({ timeout: 15_000 });

    await page.goto("/inventory/stock");
    await page.getByRole("searchbox").fill(ITEM);
    await expect(page.getByText("Low stock", { exact: true }).last()).toBeVisible({ timeout: 15_000 });
  });

  test("stores orders the missing part and it goes through approval", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/inventory");
    await page.getByRole("button", { name: `Order ${MISSING}` }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Supplier").click();
    await page.getByRole("option", { name: SUPPLIER }).click();
    await dialog.getByLabel(/unit cost/i).fill("300");
    await dialog.getByRole("button", { name: "Add to purchase order" }).click();
    await expect(page.getByText(/added to PO-/i)).toBeVisible();

    await page.getByRole("link", { name: "Purchases" }).click();
    const order = page.getByRole("listitem").filter({ hasText: SUPPLIER });
    await order.getByRole("button", { name: "Submit for approval" }).click();
    await expect(page.getByText(/sent for approval/i)).toBeVisible();
    await page.getByRole("radio", { name: /to approve/i }).click();
    await order.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/approved$/i).first()).toBeVisible();
    await page.getByRole("radio", { name: /^open/i }).click();
    await order.getByRole("button", { name: "Mark as ordered" }).click();
    await expect(order.getByText("On order")).toBeVisible({ timeout: 15_000 });
    await order.getByRole("button", { name: "Receive goods" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Receive into stock" }).click();
    await expect(page.getByText(/received in full/i)).toBeVisible({ timeout: 15_000 });
  });

  test("stores issues the delivered part and the project carries the cost", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/inventory");
    await page.getByRole("button", { name: `Issue ${MISSING}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Issue parts" }).click();
    await expect(page.getByText(/^Issued 1/)).toBeVisible({ timeout: 15_000 });

    await openProjectAsAdmin(page, PROJECT);
    // 8 × 4.50 + 1 × 300 = 336.00
    await expect(page.getByText(/Parts cost so far: .*336\.00/)).toBeVisible({ timeout: 15_000 });
  });

  test("technicians see stock read-only", async ({ page }) => {
    await login(page, "STAFF");
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/inventory\/stock/);
    await page.getByRole("searchbox").fill(ITEM);
    await expect(page.getByText(ITEM).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Add item" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Purchases" })).toHaveCount(0);
  });
});
