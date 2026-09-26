import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { openProjectAsAdmin } from "./helpers/projects";

// A client request through the whole front of house: the client asks for a
// quote, reception receives it (the project gets its ID), the workshop sends a
// quote, the client accepts it, and team notes stay out of the client's view.
const REQUEST_TITLE = `E2E request ${Date.now()}`;

/** This run's request, on the client's requests page. */
const requestItem = (page: Page) => page.getByRole("listitem").filter({ hasText: REQUEST_TITLE });

test.describe.serial("client request → reception → quote → approval", () => {
  test("client submits a quote request", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await page.getByRole("button", { name: /new request/i }).first().click();

    // "Request a quote" is preselected; fill title and details.
    await page.getByPlaceholder("e.g. Brake pad replacement").fill(REQUEST_TITLE);
    await page.getByPlaceholder(/describe what you need/i).fill("E2E test request — safe to delete.");
    await page.getByRole("button", { name: "Submit quote request" }).click();

    await expect(page.getByText("Quote request submitted")).toBeVisible();
    await expect(requestItem(page).getByText("Waiting for the workshop")).toBeVisible({ timeout: 15_000 });
  });

  test("reception receives the request and logs the project", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/reception?tab=requests");
    const card = page.getByRole("listitem").filter({ hasText: REQUEST_TITLE });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "Receive item" }).click();

    // The intake form is filled in from the request.
    await expect(page.getByLabel("What's come in")).toHaveValue(REQUEST_TITLE);
    await expect(page.getByRole("radio", { name: /^quote/i })).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("Make and model").fill("E2E Lathe 1800");
    await page.getByRole("button", { name: "Log project" }).click();

    await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: REQUEST_TITLE, level: 1 })).toBeVisible();
    await expect(page.getByText("Evaluating").first()).toBeVisible();
  });

  test("the workshop sends a quote", async ({ page }) => {
    await login(page, "ADMIN");
    await openProjectAsAdmin(page, REQUEST_TITLE);
    await page.getByRole("button", { name: "New quote" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("E2E spindle rebuild");
    await dialog.getByLabel("Line 1 description").fill("E2E line item");
    await dialog.getByLabel("Line 1 price").fill("100");
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Send to client" }).click();
    await expect(page.getByText("Waiting for client").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Quote sent").first()).toBeVisible();
  });

  test("client accepts the quote from their dashboard", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/dashboard");
    const quote = page.getByRole("region", { name: new RegExp(`Quote: ${REQUEST_TITLE}`) });
    await expect(quote).toBeVisible({ timeout: 15_000 });
    await quote.getByRole("button", { name: "Accept quote" }).click();
    await expect(page.getByText(/quote accepted/i)).toBeVisible();
  });

  test("the project is approved and the request shows it was received", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await expect(requestItem(page).getByText("Received")).toBeVisible({ timeout: 15_000 });
    await requestItem(page).getByRole("link", { name: /view project/i }).click();
    await expect(page).toHaveURL(/\/projects\//, { timeout: 15_000 });
    await expect(page.getByText("Approved").first()).toBeVisible();
  });

  test("admin posts a team note and a client message on the project", async ({ page }) => {
    await login(page, "ADMIN");
    await openProjectAsAdmin(page, REQUEST_TITLE);

    // Team notes are the default tab.
    await expect(page.getByRole("tab", { name: /team notes/i })).toHaveAttribute("aria-selected", "true");
    const teamBox = page.getByRole("textbox", { name: "Team note" });
    await teamBox.scrollIntoViewIfNeeded();
    await teamBox.fill("E2E internal note, clients must NOT see this");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("E2E internal note, clients must NOT see this")).toBeVisible({ timeout: 15_000 });

    // Client messages live in their own tab with their own composer.
    await page.getByRole("tab", { name: /client messages/i }).click();
    const clientBox = page.getByRole("textbox", { name: /^message to/i });
    await clientBox.fill("E2E public comment — hello client!");
    await page.getByRole("button", { name: /send to client/i }).click();
    await expect(page.getByText("E2E public comment — hello client!")).toBeVisible({ timeout: 15_000 });
  });

  test("client sees the message but not the team note", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/requests");
    await requestItem(page).getByRole("link", { name: /view project/i }).click();
    await expect(page).toHaveURL(/\/projects\//, { timeout: 15_000 });

    await expect(page.getByText("E2E public comment — hello client!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("E2E internal note, clients must NOT see this")).not.toBeVisible();
  });
});
