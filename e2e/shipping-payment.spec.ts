import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { login } from "./helpers/auth";
import { logProjectAtReception, openProjectAsAdmin } from "./helpers/projects";

// Payment before hand-over (Settings, Billing). Warn asks for a reason and records it with the
// hand-over; Block refuses it in the database too; a paid project goes by courier with no reason.
// Uses the local test database directly to skip the work stages and to set the policy.
const sql = (q: string) => execFileSync("docker", ["exec", "supabase_db_shoplane_test", "psql", "-U", "postgres", "-qtAc", q], { encoding: "utf8" }).trim();
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const setPolicy = (p: "off" | "warn" | "block") => sql(`update workshop_settings set handover_payment = '${p}' where id = 1`);

/** Logs a project for Demo Client and moves it straight to Ready to ship, which drafts its invoice. */
async function readyToShip(page: Page, title: string): Promise<string> {
  await login(page, "ADMIN");
  await logProjectAtReception(page, title, { client: "Demo Client" });
  // The same flag the stage functions set, so the stage guard on jobs lets this through.
  sql(`select set_config('shoplane.stage_rpc', 'on', true); update jobs set status = 'completed' where title = ${quote(title)}`);
  return sql(`select id from jobs where title = ${quote(title)}`);
}

/** Signs the current user out by clearing the session, then signs in as someone else. */
async function switchTo(page: Page, role: "MANAGER" | "CLIENT") {
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await login(page, role);
}

const shipmentStatus =(jobId: string) => sql(`select status from shipments where job_id = '${jobId}'`);

test.describe.serial("payment before hand-over", () => {
  test.afterAll(() => setPolicy("warn"));

  test("Warn: an unpaid hand-over records its reason", async ({ page }) => {
    setPolicy("warn");
    const title = `E2E warn handover ${Date.now()}`;
    const jobId = await readyToShip(page, title);
    await openProjectAsAdmin(page, title);
    // The project page shows the payment status as well as the Shipping page.
    await expect(page.getByText("Invoice not sent").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Hand over" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Mark as collected" })).toBeDisabled();
    await dialog.getByLabel("Why is it leaving before payment?").fill("E2E: account customer, pays monthly");
    await dialog.getByLabel("Collected by").fill("E2E driver Kim");
    await dialog.getByRole("button", { name: "Mark as collected" }).click();
    await expect(page.getByText(/^[A-Z]+-\d{6}-\d{3} collected$/)).toBeVisible({ timeout: 15_000 });
    expect(shipmentStatus(jobId)).toBe("shipped");
    expect(sql(`select count(*) from job_comments where job_id = '${jobId}' and body = 'Handed over before payment: E2E: account customer, pays monthly'`)).toBe("1");
  });

  test("Block: a hand-over is refused until it's paid", async ({ page }) => {
    const title = `E2E block handover ${Date.now()}`;
    const jobId = await readyToShip(page, title);
    setPolicy("block");

    // A manager handles shipping but isn't an admin, so can't override.
    await switchTo(page, "MANAGER");
    await page.goto("/shipping");
    const card = page.getByRole("listitem").filter({ hasText: title });
    await card.getByRole("button", { name: "Hand over" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/This workshop needs payment before hand-over\. Confirm the payment on the invoice, or ask an admin\./)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByLabel("Why is it leaving before payment?")).toHaveCount(0);
    await dialog.getByLabel("Collected by").fill("E2E driver Lee");
    await expect(dialog.getByRole("button", { name: "Mark as collected" })).toBeDisabled();

    // The database refuses it too, even with a reason.
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
      return key ? JSON.parse(localStorage.getItem(key)!).access_token : null;
    });
    const res = await page.request.post(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/mark_shipped`, {
      headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { _job_id: jobId, _d: { method: "pickup", collector_name: "E2E driver Lee" }, _reason: "E2E: trying anyway" },
    });
    expect(res.ok(), "mark_shipped should refuse an unpaid hand-over in Block mode").toBe(false);
    expect(await res.text()).toContain("must be paid for before it leaves");
    expect(shipmentStatus(jobId)).not.toBe("shipped");
  });

  test("a paid project goes by courier with no reason asked", async ({ page }) => {
    setPolicy("block");
    const title = `E2E courier handover ${Date.now()}`;
    const jobId = await readyToShip(page, title);
    sql(`update invoices set status = 'paid' where job_id = '${jobId}'`);

    await page.goto("/shipping");
    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card.getByText("Paid", { exact: true })).toBeVisible({ timeout: 15_000 });
    await card.getByRole("button", { name: "Hand over" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Sent by courier" }).click();
    await expect(dialog.getByLabel("Why is it leaving before payment?")).toHaveCount(0);
    await dialog.getByLabel("Courier", { exact: true }).fill("DPD");
    await dialog.getByLabel("Tracking number").fill("E2E123456");
    await dialog.getByLabel(/Tracking link/).fill("https://example.com/track/E2E123456");
    await dialog.getByRole("button", { name: "Mark as shipped" }).click();
    await expect(page.getByText(/^[A-Z]+-\d{6}-\d{3} shipped$/)).toBeVisible({ timeout: 15_000 });
    expect(shipmentStatus(jobId)).toBe("shipped");

    await openProjectAsAdmin(page, title);
    await expect(page.getByText(/DPD · E2E123456/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Track it" })).toHaveAttribute("href", "https://example.com/track/E2E123456");

    await switchTo(page, "CLIENT");
    await page.goto("/client/projects");
    await page.getByRole("searchbox").fill(title);
    await page.getByRole("link", { name: new RegExp(title) }).first().click();
    await expect(page.getByRole("heading", { name: "On its way" })).toBeVisible({ timeout: 15_000 });
  });
});
