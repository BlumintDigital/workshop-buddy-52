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
    // Scope to this run's card — older E2E requests may share status labels.
    await expect(requestCard(page).getByText("Awaiting review")).toBeVisible();
  });

  test("admin builds and sends a quote", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/requests");
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible({ timeout: 15_000 });

    await requestCard(page).getByRole("button", { name: "Build & send quote" }).click();

    const dialog = page.getByRole("dialog");
    // The dialog prefills the first row with the request title asynchronously —
    // wait for that to land or it will overwrite what we type.
    const firstDescription = dialog.getByPlaceholder("What's included").first();
    await expect(firstDescription).toHaveValue(REQUEST_TITLE, { timeout: 10_000 });
    await firstDescription.fill("E2E line item");
    // Row inputs: [0] = qty, [1] = unit price.
    await dialog.locator("input[type='number']").nth(1).fill("100");
    await dialog.getByRole("button", { name: "Send quote to client" }).click();

    await expect(page.getByText("Quote sent to the client")).toBeVisible();
  });

  test("client sees the quote and approves it", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");

    const card = requestCard(page);
    await expect(card.getByText("Quote ready — your decision")).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText("E2E line item")).toBeVisible();

    await card.getByRole("button", { name: /approve quote/i }).click();
    await expect(page.getByText(/quote approved/i)).toBeVisible();
    await expect(card.getByText("Approved — waiting for the workshop")).toBeVisible();
  });

  test("admin converts the approved quote to a job", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/requests");
    // The page defaults to the Pending tab — approved requests live under Approved.
    await page.getByRole("tab", { name: /approved/i }).click();
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible({ timeout: 15_000 });

    await requestCard(page).getByRole("button", { name: "Convert to job" }).click();
    // Conversion navigates straight to the new job's detail page.
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: REQUEST_TITLE })).toBeVisible();
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
    // Converted requests are only listed under the All tab.
    await page.getByRole("tab", { name: /all/i }).click();
    await expect(page.getByText(REQUEST_TITLE)).toBeVisible({ timeout: 15_000 });
    await requestCard(page).getByRole("link", { name: /view job/i }).click();
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });

    const composer = page.getByPlaceholder(/write a message/i);
    await composer.scrollIntoViewIfNeeded();
    await composer.fill("E2E public comment — hello client!");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("E2E public comment — hello client!")).toBeVisible({ timeout: 15_000 });

    // Flip the Internal note switch and post a second, internal comment.
    // The realtime reload from the first comment can race the composer and
    // swallow input — retype until the Send button actually enables.
    await page.getByRole("switch").click();
    const internalBox = page.getByPlaceholder(/internal note/i);
    await expect(async () => {
      await internalBox.click();
      await internalBox.fill("");
      await internalBox.pressSequentially("E2E internal note, clients must NOT see this");
      await expect(page.getByRole("button", { name: /^send$/i })).toBeEnabled({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("E2E internal note, clients must NOT see this")).toBeVisible({ timeout: 15_000 });
  });

  test("client sees the public comment but not the internal note", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await requestCard(page).getByRole("link", { name: /view job/i }).click();
    await expect(page).toHaveURL(/\/jobs\//, { timeout: 15_000 });

    await expect(page.getByText("E2E public comment — hello client!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E internal note, clients must NOT see this")).not.toBeVisible();
  });
});
