import { test, expect, type Page } from "@playwright/test";
import { login, type RoleKey } from "./helpers/auth";

// Runs against staging.shoplane.uk after every release to it (see .github/workflows/staging.yml).
// It doesn't depend on any particular data: each role signs in, its main pages open without an
// error screen or a failed request, and the site reports the version that was just released.

const PAGES: Record<RoleKey, string[]> = {
  ADMIN: ["/admin/dashboard", "/admin/projects", "/reception", "/admin/invoices", "/admin/inventory", "/admin/clients", "/admin/settings", "/admin/import"],
  MANAGER: ["/manager/dashboard", "/manager/projects", "/manager/invoices"],
  STAFF: ["/staff/dashboard"],
  CLIENT: ["/client/dashboard"],
};

async function openCleanly(page: Page, path: string) {
  const failures: string[] = [];
  const onResponse = (r: { status(): number; url(): string; request(): { method(): string } }) => {
    // A 5xx from our own database or functions means something in the release is broken.
    if (r.status() >= 500 && /supabase\.co|shoplane\.uk/.test(r.url())) failures.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  };
  page.on("response", onResponse);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  page.off("response", onResponse);
  await expect(page.getByText(/Something went wrong|Unexpected Application Error/i), `${path} shows an error screen`).toHaveCount(0);
  expect(failures, `${path} had server errors`).toEqual([]);
}

test("the site reports the version that was released", async ({ request }) => {
  const expected = process.env.E2E_EXPECT_VERSION;
  test.skip(!expected, "E2E_EXPECT_VERSION not set");
  const res = await request.get("/version.json", { headers: { "Cache-Control": "no-cache" } });
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).version).toBe(expected);
});

for (const role of Object.keys(PAGES) as RoleKey[]) {
  test(`${role.toLowerCase()} signs in and the main pages open`, async ({ page }) => {
    test.skip(!process.env[`E2E_${role}_EMAIL`], `No ${role} account configured for staging`);
    await login(page, role);
    for (const path of PAGES[role]) await openCleanly(page, path);
  });
}
