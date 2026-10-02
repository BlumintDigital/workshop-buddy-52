import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// Job cards and QR labels: reception logs a machine, then prints the A4 job card, the project
// label and the machine's label. The print dialog is stubbed so the test can see it was opened.
const STAMP = Date.now();
const SERIAL = `E2E-PRINT-${STAMP}`;
const TITLE = `E2E print ${STAMP}`;

test("prints a job card, a project label and an asset label", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed++; };
  });
  await login(page, "ADMIN");
  await page.goto("/reception");
  await page.getByLabel("Client", { exact: true }).click();
  await page.getByRole("option", { name: /Demo Client/ }).first().click();
  await page.getByLabel("What's come in").fill(TITLE);
  await page.getByLabel("Make and model").fill("Haas VF-2");
  await page.getByLabel("Serial or asset number").fill(SERIAL);
  await page.getByLabel("Running hours (optional)").fill("8400");
  await page.getByRole("radio", { name: /^Approved job/ }).click();
  await page.getByRole("button", { name: "Log project" }).click();
  await expect(page).toHaveURL(/\/projects\//, { timeout: 20_000 });
  const projectId = page.url().split("/projects/")[1].split(/[?#]/)[0];

  // The Print menu offers both formats in a new tab.
  await page.getByRole("button", { name: "Print" }).click();
  await expect(page.getByRole("menuitem", { name: "Job card (A4)" })).toHaveAttribute("href", `/print/job-card/${projectId}`);
  await expect(page.getByRole("menuitem", { name: "QR label (62 mm)" })).toHaveAttribute("target", "_blank");
  await page.keyboard.press("Escape");

  await page.goto(`/print/job-card/${projectId}`);
  const card = page.locator("article");
  await expect(card.getByRole("heading", { name: TITLE })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText(SERIAL)).toBeVisible();
  await expect(card.getByText("8,400")).toBeVisible();
  await expect(card.getByText("Quality check passed by")).toBeVisible();
  await expect(card.getByAltText("QR code for this project")).toHaveAttribute("src", /^data:image\/png/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  await page.goto(`/print/project-label/${projectId}`);
  await expect(page.getByText(TITLE)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByAltText("QR code")).toBeVisible();
  // Switching size re-renders without opening the dialog again.
  await page.getByLabel("Label size").selectOption("62x29");
  await expect(page).toHaveURL(/size=62x29/);

  await page.goto(`/projects/${projectId}`);
  await page.getByRole("link", { name: "Service history" }).click();
  await expect(page.getByRole("link", { name: "Print label" })).toBeVisible({ timeout: 15_000 });
  const href = await page.getByRole("link", { name: "Print label" }).getAttribute("href");
  await page.goto(href!);
  await expect(page.getByText(SERIAL)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Scan for service history")).toBeVisible();
});

test("a project that doesn't exist says so", async ({ page }) => {
  await login(page, "ADMIN");
  await page.goto("/print/job-card/00000000-0000-0000-0000-000000000000?auto=0");
  await expect(page.getByText(/isn't available/)).toBeVisible({ timeout: 15_000 });
});
