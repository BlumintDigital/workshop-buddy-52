import { describe, expect, it } from "vitest";
import { describeDue, describeInterval, firstDueDate, formatMeter, reminderState, worstState } from "@/lib/assets";
import { INDUSTRIES, INDUSTRY_KEYS, assetSummary, customerName, industryProfile, normaliseRegistration } from "@/lib/industry";
import { clientLabel } from "@/components/project/IntakeForm";

const r = (o: Partial<Parameters<typeof reminderState>[0]> = {}) => ({
  title: "Service", active: true, due_date: null, due_meter: null, interval_meter: null, ...o,
});
const TODAY = new Date(2026, 9, 2); // 2 Oct 2026

describe("reminder state", () => {
  it("goes from scheduled to due soon to overdue by date", () => {
    expect(reminderState(r({ due_date: "2026-11-30" }), null, TODAY)).toBe("ok");
    expect(reminderState(r({ due_date: "2026-10-16" }), null, TODAY)).toBe("due_soon");
    expect(reminderState(r({ due_date: "2026-10-02" }), null, TODAY)).toBe("due_soon");
    expect(reminderState(r({ due_date: "2026-10-01" }), null, TODAY)).toBe("overdue");
  });

  it("uses the meter: within 10% of the interval is due soon, past it is overdue", () => {
    const m = r({ due_meter: 1700, interval_meter: 500 });
    expect(reminderState(m, 1600, TODAY)).toBe("ok");
    expect(reminderState(m, 1650, TODAY)).toBe("due_soon");
    expect(reminderState(m, 1700, TODAY)).toBe("overdue");
    expect(reminderState(m, null, TODAY)).toBe("ok");
  });

  it("takes whichever comes first, and finished reminders are inactive", () => {
    expect(reminderState(r({ due_date: "2027-06-01", due_meter: 60000, interval_meter: 10000 }), 61000, TODAY)).toBe("overdue");
    expect(reminderState(r({ active: false, due_date: "2020-01-01" }), null, TODAY)).toBe("inactive");
  });

  it("an asset's badge is its worst reminder", () => {
    expect(worstState(["ok", "due_soon", "ok"])).toBe("due_soon");
    expect(worstState(["due_soon", "overdue"])).toBe("overdue");
    expect(worstState([])).toBeNull();
  });
});

describe("reminder wording", () => {
  it("describes when it's due and how often", () => {
    expect(describeDue({ due_date: null, due_meter: 60000 }, "miles")).toBe("Due at 60,000 miles");
    expect(describeInterval(12, 10000, "miles")).toBe("Every 12 months or 10,000 miles");
    expect(describeInterval(null, 500, "hours")).toBe("Every 500 hours");
    expect(describeInterval(null, null, "hours")).toBeNull();
    expect(formatMeter(1234.6, "hours")).toBe("1,235 hours");
  });

  it("first due date is today plus the interval", () => {
    expect(firstDueDate(12, new Date(2026, 9, 2))).toBe("2027-10-02");
    expect(firstDueDate(2, new Date(2026, 11, 15))).toBe("2027-02-15");
  });
});

describe("industry profiles", () => {
  it("every profile has wording, fields and presets", () => {
    for (const k of INDUSTRY_KEYS) {
      const p = INDUSTRIES[k];
      expect(p.asset.navLabel.length).toBeGreaterThan(0);
      expect(p.reminderPresets.length).toBeGreaterThan(0);
      expect(p.intake.showSerial || p.intake.showRegistration).toBe(true);
    }
  });

  it("garages identify vehicles by registration; machine shops by serial", () => {
    expect(INDUSTRIES.garage.intake.showRegistration).toBe(true);
    expect(INDUSTRIES.garage.asset.meterUnit).toBe("miles");
    expect(INDUSTRIES.industrial.intake.showRegistration).toBe(false);
    expect(INDUSTRIES.industrial.asset.meterUnit).toBe("hours");
    expect(industryProfile("unknown").key).toBe("industrial");
    expect(industryProfile(null).key).toBe("industrial");
  });

  it("summarises an asset by its best identifier", () => {
    expect(assetSummary({ name: "Ford Transit", registration: "AB12 CDE" })).toBe("AB12 CDE · Ford Transit");
    expect(assetSummary({ name: "Lathe", serial_number: "4471" })).toBe("SN 4471 · Lathe");
    expect(assetSummary({ name: "Van", fleet_number: "17" })).toBe("Fleet 17 · Van");
    expect(normaliseRegistration(" ab12   cde ")).toBe("AB12 CDE");
  });

  it("garages name customers by person, machine shops by company", () => {
    expect(INDUSTRIES.garage.customer.personFirst).toBe(true);
    expect(INDUSTRIES.industrial.customer.personFirst).toBe(false);
    const c = { id: "1", full_name: "Jo Smith", company_name: "Acme Ltd", phone: null, email: "jo@x.uk" };
    expect(customerName(c, true)).toBe("Jo Smith");
    expect(customerName(c, false)).toBe("Acme Ltd");
    expect(customerName({ full_name: "Jo Smith", company_name: null }, false)).toBe("Jo Smith");
    expect(clientLabel(c, true)).toBe("Jo Smith · Acme Ltd");
    expect(clientLabel(c)).toBe("Acme Ltd · Jo Smith");
    expect(clientLabel({ ...c, company_name: null }, true)).toBe("Jo Smith");
  });
});
