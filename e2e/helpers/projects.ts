import { expect, type Page } from "@playwright/test";

/** Opens a project from the admin project list by searching for its title. */
export async function openProjectAsAdmin(page: Page, title: string) {
  await page.goto("/admin/projects");
  await page.getByRole("searchbox", { name: /search by project id or title/i }).fill(title);
  await page.getByRole("link", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible({ timeout: 20_000 });
}

/**
 * Logs a project at reception (walk-in by default) and waits for its page.
 * Pass a client's display name to log it for that client instead.
 */
export async function logProjectAtReception(page: Page, title: string, opts: { client?: string; intake?: "Evaluation" | "Quote" | "Approved job" } = {}) {
  await page.goto("/reception");
  if (opts.client) {
    await page.getByLabel("Client", { exact: true }).click();
    await page.getByRole("option", { name: new RegExp(opts.client) }).first().click();
  } else {
    await page.getByRole("radio", { name: "One-off" }).click();
    await page.getByLabel("Name", { exact: true }).fill("E2E walk-in");
  }
  await page.getByLabel("What's come in").fill(title);
  await page.getByRole("radio", { name: new RegExp(`^${opts.intake ?? "Approved job"}`) }).click();
  await page.getByRole("button", { name: "Log project" }).click();
  await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
}

/** The ID of the project whose page is open. */
export function projectIdFromUrl(page: Page): string {
  const id = page.url().match(/\/projects\/([0-9a-f-]{36})/)?.[1];
  if (!id) throw new Error(`Not on a project page: ${page.url()}`);
  return id;
}

/**
 * Calls the database API directly as the signed-in user, the way a script in the
 * browser could, to check what the server allows without the app's buttons.
 */
export async function apiAsUser(page: Page, method: "GET" | "POST" | "PATCH", path: string, data?: unknown) {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    return key ? JSON.parse(localStorage.getItem(key)!).access_token : null;
  });
  return page.request.fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    data,
    headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}
