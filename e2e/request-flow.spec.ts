import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// One shared title threads the request through every stage of the flow.
const REQUEST_TITLE = `E2E request ${Date.now()}`;

/** The request card on either the client or admin requests page. */
const requestCard = (page: import("@playwright/test").Page) =>
  page.locator("div[class*='rounded']").filter({ hasText: REQUEST_TITLE }).last();

test.describe.serial("client request → quote → approval → job", () => {
  test("client submits a quote request", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await page.getByRole("button", { name: /new request/i }).first().click();

    // "Request a quote" card is preselected; fill title + details.
    await page.getByPlaceholder("e.g. Brake pad replacement").fill(REQUEST_TITLE);
    await page.getByPlaceholder(/describe what you need/i).fill("E2E test request — safe to delete.");
    await page.getByRole("button", { name: "Submit quote request" }).click();

    await expect(page.getByText("Quote request submitted")).toBeVisible();
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible();
    await expect(page.getByText("Awaiting review")).toBeVisible();
  });

  test("admin builds and sends a quote", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/requests");
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible({ timeout: 15_000 });

    await requestCard(page).getByRole("button", { name: "Build & send quote" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("What's included").first().fill("E2E line item");
    // Row inputs: [0] = qty, [1] = unit price.
    await dialog.locator("input[type='number']").nth(1).fill("100");
    await dialog.getByRole("button", { name: "Send quote to client" }).click();

    await expect(page.getByText("Quote sent to the client")).toBeVisible();
  });

  test("client sees the quote and approves it", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");

    await expect(page.getByText("Quote ready — your decision")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E line item")).toBeVisible();

    await requestCard(page).getByRole("button", { name: /approve quote/i }).click();
    await expect(page.getByText(/quote approved/i)).toBeVisible();
    await expect(page.getByText("Approved — waiting for the workshop")).toBeVisible();
  });

  test("admin converts the approved quote to a job", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/requests");
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible({ timeout: 15_000 });

    await requestCard(page).getByRole("button", { name: "Convert to job" }).click();
    await expect(requestCard(page).getByRole("link", { name: /view job/i })).toBeVisible({ timeout: 15_000 });
  });

  test("client can open the converted job", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible({ timeout: 15_000 });

    await requestCard(page).getByRole("link", { name: /view job/i }).click();
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });
    await expect(page.getByText(REQUEST_TITLE).first()).toBeVisible();
  });

  test("admin posts a client-visible and an internal comment on the job", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/requests");
    await requestCard(page).getByRole("link", { name: /view job/i }).click();
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });

    const composer = page.getByPlaceholder(/write a message/i);
    await composer.scrollIntoViewIfNeeded();
    await composer.fill("E2E public comment — hello client!");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("E2E public comment — hello client!")).toBeVisible({ timeout: 15_000 });

    // Flip the Internal note switch and post a second, internal comment.
    await page.getByRole("switch").click();
    await page.getByPlaceholder(/internal note/i).fill("E2E internal note — client must NOT see this");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("E2E internal note — client must NOT see this")).toBeVisible({ timeout: 15_000 });
  });

  test("client sees the public comment but not the internal note", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await requestCard(page).getByRole("link", { name: /view job/i }).click();
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });

    await expect(page.getByText("E2E public comment — hello client!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E internal note — client must NOT see this")).not.toBeVisible();
  });
});
