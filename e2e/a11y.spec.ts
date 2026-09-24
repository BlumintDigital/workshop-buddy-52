import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, type RoleKey } from "./helpers/auth";

// Automated accessibility checks (WCAG 2.1 A/AA) on each role's main screens.
// Fails on serious or critical issues; minor/moderate ones are reported in the
// test output so they can be fixed without blocking a release.

const PAGES: Record<RoleKey, string[]> = {
  ADMIN: ["/admin/dashboard", "/admin/jobs", "/admin/invoices", "/admin/inventory", "/admin/settings"],
  MANAGER: ["/manager/dashboard"],
  STAFF: ["/staff/dashboard"],
  CLIENT: ["/client/dashboard"],
};

async function scan(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
  // Let data-driven content (lists, figures) finish rendering before scanning.
  // (Not "networkidle": the app keeps a realtime connection open, so the network never goes idle.)
  await page.waitForTimeout(2_000);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const minor = results.violations.filter((v) => !blocking.includes(v));
  if (minor.length) {
    console.log(`[a11y] ${path}: ${minor.length} minor issue(s): ${minor.map((v) => v.id).join(", ")}`);
  }
  expect(
    blocking.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×) → ${v.nodes[0]?.target.join(" ")}`),
    `Serious accessibility issues on ${path}`,
  ).toEqual([]);
}

for (const role of Object.keys(PAGES) as RoleKey[]) {
  test.describe(`accessibility: ${role.toLowerCase()}`, () => {
    for (const viewport of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "phone", width: 375, height: 812 },
    ]) {
      test(`${role.toLowerCase()} screens pass WCAG AA checks (${viewport.name})`, async ({ page }) => {
        test.setTimeout(60_000 + PAGES[role].length * 30_000);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await login(page, role);
        for (const path of PAGES[role]) {
          await scan(page, path);
        }
      });
    }
  });
}
