import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

// Registration lookup, VIN decode and postcode fill. The provider calls are answered by a stub so
// the test doesn't spend the shared Zyfy allowance; the last test talks to the real function.
const STAMP = Date.now();
const REG = `KS${String(STAMP).slice(-2)} LYH`;

const VEHICLE = {
  registration: REG.replace(" ", ""), make: "Vauxhall", model: "Insignia", colour: "Blue", fuel: "Diesel", year: 2019,
  engine_cc: 1956, first_registered: "2019-11", mot_status: "valid", mot_expiry: "2027-09-21", tax_status: "taxed",
  tax_due: "2027-02-01", mileage: 115001, mot_failure_areas: ["suspension", "tyres"], mot_advisory_areas: ["brakes", "tyres", "lights"],
};

async function stubLookups(page: Page, status: Record<string, boolean>) {
  await page.route("**/functions/v1/lookup", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    const body = route.request().postDataJSON() as { action: string };
    const reply = (data: unknown) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) });
    if (body.action === "status") return reply(status);
    if (body.action === "vehicle") return reply({ result: VEHICLE });
    if (body.action === "vin") return reply({ result: { vin: "1FTFW1E50MFA00000", make: "Ford", model: "F-150", year: 2021, body: "Pickup", fuel: "Gasoline" } });
    if (body.action === "address") return reply({ results: [{ label: "Westminster, London, SW1A 2AA", line1: "", city: "Westminster", region: "London", postcode: "SW1A 2AA", country: "United Kingdom", country_code: "GB" }] });
    return reply({});
  });
}

test("a registration lookup fills in the vehicle and adds its MOT reminder", async ({ page }) => {
  await stubLookups(page, { vehicle: true, vin: true, address_search: false, uk_postcode: true });
  await login(page, "ADMIN");
  await page.goto("/assets");
  await page.getByRole("button", { name: /^Add / }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type").click();
  await page.getByRole("option", { name: "Vehicle" }).click();

  // Machines don't get year, colour or fuel; vehicles do.
  await expect(dialog.getByLabel("Year")).toBeVisible();
  await dialog.getByLabel("Registration").fill(REG);
  await dialog.getByRole("button", { name: "Look up" }).click();
  await expect(dialog.getByLabel("Make and model")).toHaveValue("Vauxhall Insignia");
  await expect(dialog.getByLabel("Year")).toHaveValue("2019");
  await expect(dialog.getByLabel("Colour")).toHaveValue("Blue");
  await expect(dialog.getByLabel("Fuel")).toHaveValue("Diesel");
  await expect(dialog.getByLabel("Current reading")).toHaveValue("115001");
  await expect(dialog.getByTestId("vehicle-summary")).toContainText("Blue · Diesel · 2019 · 1,956 cc · MOT until");
  await expect(dialog.getByText("Past MOT failures: suspension, tyres · Advisories: brakes, tyres, lights")).toBeVisible();
  await expect(dialog.locator("#asset-name")).toHaveValue(`Vauxhall Insignia ${REG}`);

  // VIN decode only fills what's still empty.
  await dialog.getByLabel("VIN").fill("1FTFW1E50MFA00000");
  await dialog.getByRole("button", { name: "Decode" }).click();
  await expect(page.getByText("2021 · Ford · F-150 · Pickup")).toBeVisible();
  await expect(dialog.getByLabel("Make and model")).toHaveValue("Vauxhall Insignia");

  await dialog.getByRole("button", { name: /^Add (machine|vehicle|equipment)$/ }).click();
  await expect(page.getByText(/added\. MOT reminder added to .*2027/)).toBeVisible({ timeout: 15_000 });

  // Saving opens the vehicle's page.
  await expect(page.getByRole("heading", { name: `Vauxhall Insignia ${REG}`, level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("2019", { exact: true })).toBeVisible();
  await expect(page.getByText("115,001 miles", { exact: false })).toBeVisible();
  await expect(page.getByText(/Due Sep 21, 2027|Due 21 Sept? 2027/)).toBeVisible();
  await expect(page.getByText("Blue", { exact: true })).toBeVisible();
  await expect(page.getByText("MOT", { exact: true }).first()).toBeVisible();
});

test("a UK postcode fills in the town and county", async ({ page }) => {
  await stubLookups(page, { vehicle: false, vin: true, address_search: false, uk_postcode: true });
  await login(page, "ADMIN");
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "Add client" }).first().click();
  const address = page.getByRole("dialog").getByLabel("Address");
  await address.fill("10 Downing Street, SW1A 2AA");
  await page.getByRole("option", { name: "Fill in Westminster, London, SW1A 2AA" }).click();
  await expect(address).toHaveValue("10 Downing Street, Westminster, London, SW1A 2AA");
});

test("without a provider key the Look up button stays hidden", async ({ page }) => {
  await login(page, "ADMIN");
  const status = page.waitForResponse((r) => r.url().includes("/functions/v1/lookup") && r.request().method() === "POST");
  await page.goto("/assets");
  await page.getByRole("button", { name: /^Add / }).click();
  await page.getByRole("dialog").getByLabel("Type").click();
  await page.getByRole("option", { name: "Vehicle" }).click();
  expect(await (await status).json()).toMatchObject({ vehicle: false, vin: true, address_search: false, uk_postcode: true });
  await expect(page.getByRole("dialog").getByLabel("Registration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Look up" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Decode" })).toBeVisible();
});
