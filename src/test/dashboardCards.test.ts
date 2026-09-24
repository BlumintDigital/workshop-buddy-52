import { describe, expect, it } from "vitest";
import {
  cardsForRole,
  layoutToPrefs,
  moveCard,
  resolveLayout,
  setCardVisible,
} from "@/lib/dashboardCards";
import { overdueInvoiceFilter, todayIso } from "@/lib/dashboardQueries";

const withAppointments = { appointments: true };

const ids = (layout: ReturnType<typeof resolveLayout>) => layout.map((e) => e.meta.id);
const visibleIds = (layout: ReturnType<typeof resolveLayout>) =>
  layout.filter((e) => e.visible).map((e) => e.meta.id);

describe("resolveLayout", () => {
  it("uses role defaults when nothing is saved", () => {
    const admin = resolveLayout("admin", null, withAppointments);
    expect(ids(admin)[0]).toBe("attention");
    expect(visibleIds(admin)).toContain("revenue");
    expect(visibleIds(admin)).not.toContain("activity");

    const manager = resolveLayout("manager", null, withAppointments);
    expect(ids(manager)).not.toContain("onboarding");
    expect(ids(manager)).not.toContain("activity");
    expect(visibleIds(manager)).not.toContain("revenue");
  });

  it("drops cards whose feature is off", () => {
    expect(ids(resolveLayout("admin", null, { appointments: false }))).not.toContain("schedule");
  });

  it("keeps the saved order, ignores unknown ids and appends new cards", () => {
    const layout = resolveLayout(
      "admin",
      { order: ["jobs", "retired-card", "attention"], hidden: [] },
      withAppointments,
    );
    expect(ids(layout).slice(0, 2)).toEqual(["jobs", "attention"]);
    expect(ids(layout)).not.toContain("retired-card");
    expect(ids(layout)).toHaveLength(cardsForRole("admin", withAppointments).length);
  });

  it("gives cards added after the prefs were saved their default visibility", () => {
    const layout = resolveLayout("admin", { order: ["attention", "jobs"], hidden: [] }, withAppointments);
    const revenue = layout.find((e) => e.meta.id === "revenue");
    const activity = layout.find((e) => e.meta.id === "activity");
    expect(revenue?.visible).toBe(true);
    expect(activity?.visible).toBe(false);
  });

  it("never hides the required attention card", () => {
    const layout = resolveLayout("admin", { order: [], hidden: ["attention"] }, withAppointments);
    expect(layout.find((e) => e.meta.id === "attention")?.visible).toBe(true);
    expect(setCardVisible(layout, "attention", false).find((e) => e.meta.id === "attention")?.visible).toBe(true);
  });
});

describe("editing a layout", () => {
  it("moves cards and round-trips through prefs", () => {
    const start = resolveLayout("admin", null, withAppointments);
    const moved = moveCard(start, "jobs", -1);
    const index = ids(moved).indexOf("jobs");
    expect(index).toBe(ids(start).indexOf("jobs") - 1);

    const hidden = setCardVisible(moved, "team", false);
    const prefs = layoutToPrefs(hidden);
    expect(prefs.hidden).toContain("team");
    expect(ids(resolveLayout("admin", prefs, withAppointments))).toEqual(ids(hidden));
    expect(visibleIds(resolveLayout("admin", prefs, withAppointments))).not.toContain("team");
  });

  it("ignores moves past either end", () => {
    const start = resolveLayout("admin", null, withAppointments);
    expect(moveCard(start, "attention", -1)).toBe(start);
    expect(moveCard(start, start[start.length - 1].meta.id, 1)).toBe(start);
  });
});

describe("shared dashboard queries", () => {
  it("formats today as a local calendar date", () => {
    expect(todayIso(new Date(2026, 8, 4, 23, 30))).toBe("2026-09-04");
  });

  it("counts marked-overdue and past-due sent invoices, never drafts", () => {
    const filter = overdueInvoiceFilter("2026-09-24");
    expect(filter).toBe("status.eq.overdue,and(status.eq.sent,due_date.lt.2026-09-24)");
    expect(filter).not.toContain("draft");
  });
});
