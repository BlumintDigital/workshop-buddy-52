import { Page } from "@playwright/test";

/**
 * Picks a day in the open date picker, moving to the next month first when the
 * day falls there. Days shown from neighbouring months are skipped, so "4"
 * never lands on a past, disabled day at the start of the grid.
 */
export async function pickCalendarDay(page: Page, target: Date) {
  const now = new Date();
  const monthsAhead = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth();
  for (let i = 0; i < monthsAhead; i++) await page.getByRole("button", { name: /next month/i }).click();
  await page
    .locator('button[name="day"]:not(.day-outside)')
    .filter({ hasText: new RegExp(`^${target.getDate()}$`) })
    .first()
    .click();
}
