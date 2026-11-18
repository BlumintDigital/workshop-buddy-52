import { describe, expect, it } from "vitest";
import {
  collectionReminderEmail,
  isQuietHours,
  localDate,
  nextIntervalStep,
  nextOverdueStep,
  overdueInvoiceEmail,
  quoteReminderEmail,
} from "../../supabase/functions/_shared/reminders.ts";

describe("isQuietHours (Europe/London)", () => {
  it("is quiet from 21:00 to 08:00 in winter (GMT)", () => {
    expect(isQuietHours(new Date("2026-11-18T20:59:00Z"))).toBe(false);
    expect(isQuietHours(new Date("2026-11-18T21:00:00Z"))).toBe(true);
    expect(isQuietHours(new Date("2026-11-19T07:59:00Z"))).toBe(true);
    expect(isQuietHours(new Date("2026-11-19T08:00:00Z"))).toBe(false);
  });
  it("follows British Summer Time", () => {
    // 07:30 UTC is 08:30 BST; 20:15 UTC is 21:15 BST.
    expect(isQuietHours(new Date("2026-07-01T07:30:00Z"))).toBe(false);
    expect(isQuietHours(new Date("2026-07-01T20:15:00Z"))).toBe(true);
  });
});

describe("localDate", () => {
  it("uses the London date, not UTC", () => {
    expect(localDate(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(localDate(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-18");
  });
});

describe("nextIntervalStep", () => {
  const sent = "2026-11-10T10:00:00Z";
  it("waits N days for the first reminder", () => {
    expect(nextIntervalStep(sent, 0, 3, 2, new Date("2026-11-13T09:59:00Z"))).toBeNull();
    expect(nextIntervalStep(sent, 0, 3, 2, new Date("2026-11-13T10:00:00Z"))).toBe(1);
  });
  it("sends the second after 2N days, then stops", () => {
    expect(nextIntervalStep(sent, 1, 3, 2, new Date("2026-11-15T10:00:00Z"))).toBeNull();
    expect(nextIntervalStep(sent, 1, 3, 2, new Date("2026-11-16T10:00:00Z"))).toBe(2);
    expect(nextIntervalStep(sent, 2, 3, 2, new Date("2027-01-01T10:00:00Z"))).toBeNull();
  });
  it("only ever offers the next step, even when late", () => {
    expect(nextIntervalStep(sent, 0, 3, 2, new Date("2026-12-31T10:00:00Z"))).toBe(1);
  });
});

describe("nextOverdueStep", () => {
  it("reminds on each chosen day after the due date, in order", () => {
    expect(nextOverdueStep("2026-11-01", 0, [7, 21], "2026-11-07")).toBeNull();
    expect(nextOverdueStep("2026-11-01", 0, [7, 21], "2026-11-08")).toBe(1);
    expect(nextOverdueStep("2026-11-01", 1, [21, 7], "2026-11-21")).toBeNull();
    expect(nextOverdueStep("2026-11-01", 1, [21, 7], "2026-11-22")).toBe(2);
    expect(nextOverdueStep("2026-11-01", 2, [7, 21], "2027-02-01")).toBeNull();
  });
  it("ignores duplicate and invalid days", () => {
    expect(nextOverdueStep("2026-11-01", 1, [7, 7, 0], "2026-12-31")).toBeNull();
  });
});

describe("reminder emails", () => {
  const all = [
    quoteReminderEmail({ title: "P-12 · Gearbox <rebuild>", sentAt: "2026-11-10T10:00:00Z", link: "https://x.test/q/abc" }),
    overdueInvoiceEmail({ number: "INV-7", amount: "GBP 120.00", dueDate: "2026-11-01", link: "https://x.test/client/invoices/1" }),
    collectionReminderEmail({ label: "P-12 · Gearbox", link: "https://x.test/projects/1" }),
  ];
  it("include the link and no em dashes", () => {
    for (const e of all) {
      expect(e.html).toContain("https://x.test/");
      expect(e.subject + e.html).not.toContain("—");
    }
  });
  it("escapes what came from the database", () => {
    expect(all[0].html).toContain("Gearbox &lt;rebuild&gt;");
    expect(all[1].html).toContain("1 Nov 2026");
  });
});
