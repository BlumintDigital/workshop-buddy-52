import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { login } from "./helpers/auth";

// Settings changed elsewhere (Shoplane Control, another admin) show up on an open Settings page,
// and unsaved edits aren't silently overwritten. Changes the name in the local test database.
const sql = (q: string) => execFileSync("docker", ["exec", "supabase_db_shoplane_test", "psql", "-U", "postgres", "-qtAc", q], { encoding: "utf8" }).trim();

test("an open Settings page follows changes made elsewhere", async ({ page }) => {
  const original = sql("select workshop_name from workshop_settings where id = 1");
  try {
    await login(page, "ADMIN");
    await page.goto("/admin/settings");
    const name = page.locator("#workshop_name");
    await expect(name).toHaveValue(original);

    // No unsaved edits: the new value just appears.
    sql("update workshop_settings set workshop_name = 'Changed In Control' where id = 1");
    await expect(name).toHaveValue("Changed In Control", { timeout: 15_000 });

    // Unsaved edits: keep them and say the settings changed.
    await page.locator("#phone").fill("+44 700 900 0000");
    sql("update workshop_settings set workshop_name = 'Changed Again' where id = 1");
    await expect(page.getByText("These settings were changed somewhere else")).toBeVisible({ timeout: 15_000 });
    await expect(name).toHaveValue("Changed In Control");
    await page.getByRole("button", { name: "Reload settings" }).click();
    await expect(name).toHaveValue("Changed Again");
  } finally {
    sql(`update workshop_settings set workshop_name = '${original.replace(/'/g, "''")}' where id = 1`);
  }
});
