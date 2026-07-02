import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

const CLIENT_APPT = `E2E appointment ${Date.now()}`;
const ADMIN_APPT = `E2E admin appt ${Date.now()}`;

test.describe.serial("appointments", () => {
  test("client books an appointment via available time slots", async ({ page }) => {
    await login(page, "CLIENT");
    await page.goto("/client/appointments");

    await page.getByRole("button", { name: "Book Appointment" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("e.g. Oil Change").fill(CLIENT_APPT);

    // Open the date popover and pick a day next week (always in the future).
    await dialog.getByRole("button", { name: /pick a date/i }).click();
    const target = new Date();
    target.setDate(target.getDate() + 7);
    const dayName = target.toLocaleDateString("en-US", { weekday: "long" });
    const monthName = target.toLocaleDateString("en-US", { month: "long" });
    await page
      .getByRole("gridcell", { name: new RegExp(`${dayName}, ${monthName} ${target.getDate()}`) })
      .or(page.getByRole("gridcell", { name: String(target.getDate()), exact: true }))
      .first()
      .click();

    // The calendar popover stays open after picking a day and covers the time
    // slots — Escape closes just the popover (topmost Radix layer).
    await page.keyboard.press("Escape");

    // Pick the first available (enabled) time slot — match by inner text since
    // the slot buttons don't expose an accessible name.
    await expect(dialog.getByText("Available Time Slots")).toBeVisible({ timeout: 15_000 });
    const slot = dialog.locator("button:not([disabled])").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();

    await dialog.getByRole("button", { name: "Book", exact: true }).click();
    await expect(page.getByText(CLIENT_APPT)).toBeVisible({ timeout: 15_000 });
  });

  test("admin sees the booking, adds notes, and confirms it", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/appointments");

    await expect(page.getByText(CLIENT_APPT)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link", { name: CLIENT_APPT }).click();
    await expect(page).toHaveURL(/\/appointments\//);

    await page.getByPlaceholder(/add notes about this appointment/i).fill("E2E note from admin");
    await page.getByRole("button", { name: "Save Notes" }).click();
    await expect(page.getByText("Notes saved")).toBeVisible();

    // Status select → confirmed.
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "confirmed" }).click({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByText("Status updated")).toBeVisible({ timeout: 10_000 });
  });

  test("admin creates an appointment directly", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/appointments");

    await page.getByRole("button", { name: "New Appointment" }).click();
    const dialog = page.getByRole("dialog");

    // Field order: Title input, Client select, Date, Time, Type, Duration, Notes.
    await dialog.getByRole("textbox").first().fill(ADMIN_APPT);
    await dialog.getByRole("combobox").filter({ hasText: "Select client" }).click();
    await page.getByRole("option", { name: "Demo Client" }).click({ timeout: 10_000 }).catch(() => {});

    // Date: DatePickerInput is a readonly input; its calendar opens via the
    // "Select date" icon button and closes itself after picking a day.
    const target = new Date();
    target.setDate(target.getDate() + 8);
    const dayName = target.toLocaleDateString("en-US", { weekday: "long" });
    const monthName = target.toLocaleDateString("en-US", { month: "long" });
    await dialog.getByRole("button", { name: "Select date" }).click();
    await page
      .getByRole("gridcell", { name: new RegExp(`${dayName}, ${monthName} ${target.getDate()}`) })
      .or(page.getByRole("gridcell", { name: String(target.getDate()), exact: true }))
      .first()
      .click();

    await dialog.locator("input[type='time']").fill("10:30");
    await dialog.getByRole("button", { name: "Create Appointment" }).click();
    await expect(page.getByText(ADMIN_APPT)).toBeVisible({ timeout: 15_000 });
  });
});
