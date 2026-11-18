import { describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "@/lib/dashboardQueries";
import { buildTodoItems, conversionFigure, efficiencyFigure, listPreview, type TodoOptions } from "@/lib/dashboardTodo";

const empty: DashboardSnapshot = {
  openJobs: [],
  openCount: 0,
  intakeCount: 0,
  dueCount: 0,
  reviewCount: 0,
  teamLoad: [],
  efficiency: { logged_hours: 0, available_hours: 0, people: 0, pct: null },
  quoteConversion: { accepted: 0, declined: 0, pct: null },
  paidInvoices: [],
  unpaidTotal: 0,
  overdueInvoices: [],
  draftInvoices: [],
  appointments: [],
  lowStock: [],
  staleQuotes: [],
  pendingInvites: 0,
  uninvoicedCount: 0,
  uninvoicedPreview: [],
  poApprovalCount: 0,
  shipWaitingCount: 0,
  stuckCount: 0,
  atRiskCount: 0,
};

const opts: TodoOptions = {
  role: "manager",
  mfaEnabled: true,
  canSeeMoney: true,
  canSeeCosts: true,
  format: (n) => `£${n.toFixed(2)}`,
  today: "2026-11-18",
};

describe("buildTodoItems", () => {
  it("is empty when nothing is waiting", () => {
    expect(buildTodoItems(empty, opts)).toEqual([]);
  });

  it("uses the server's exact count, not the length of the preview", () => {
    const items = buildTodoItems(
      { ...empty, uninvoicedCount: 512, uninvoicedPreview: [{ id: "a", ref: "P-1", title: "Pump", client_id: "c" }] },
      opts,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ count: 512, title: "Finished projects with no invoice", to: "/manager/projects?status=uninvoiced" });
    expect(items[0].meta).toBe("P-1 Pump and 511 more");
  });

  it("adds the new kinds with filtered links", () => {
    const items = buildTodoItems({ ...empty, poApprovalCount: 2, shipWaitingCount: 1, atRiskCount: 3, stuckCount: 4 }, opts);
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId["po-approval"]).toMatchObject({ count: 2, to: "/inventory/purchases?filter=approval" });
    expect(byId["ship-waiting"]).toMatchObject({ count: 1, to: "/shipping" });
    expect(byId["at-risk"]).toMatchObject({ count: 3, to: "/manager/projects?status=at_risk" });
    expect(byId["stuck-projects"]).toMatchObject({ count: 4, to: "/manager/projects?status=stuck" });
  });

  it("opens overdue invoices filtered to overdue, most severe first", () => {
    const items = buildTodoItems(
      {
        ...empty,
        lowStock: [{ id: "s", name: "Oil", quantity: 1, min_stock: 5, unit: "l" }],
        overdueInvoices: [{ id: "i", invoice_number: "INV-1", client_id: null, due_date: "2026-11-08", amount: 120 }],
      },
      opts,
    );
    expect(items[0]).toMatchObject({ id: "overdue-invoices", count: 1, title: "Invoice overdue · £120.00", to: "/manager/invoices?status=overdue" });
    expect(items[0].meta).toBe("INV-1 (10 days)");
    expect(items[1].id).toBe("low-stock");
  });

  it("hides money from people without Billing, and at-risk from people without Reports", () => {
    const items = buildTodoItems(
      {
        ...empty,
        atRiskCount: 2,
        overdueInvoices: [{ id: "i", invoice_number: "INV-1", client_id: null, due_date: null, amount: 120 }],
      },
      { ...opts, canSeeMoney: false, canSeeCosts: false },
    );
    expect(items.map((i) => i.id)).toEqual(["overdue-invoices"]);
    expect(items[0].title).toBe("Invoice overdue");
  });
});

describe("listPreview", () => {
  it("lists up to three and counts the rest", () => {
    expect(listPreview(["a", "b"])).toBe("a, b");
    expect(listPreview(["a", "b", "c", "d"])).toBe("a, b, c and 1 more");
  });
});

describe("ratio figures", () => {
  it("explains an empty efficiency instead of showing 0%", () => {
    expect(efficiencyFigure({ logged_hours: 0, available_hours: 0, people: 0, pct: null })).toEqual({ value: null, detail: "Add technicians to see this" });
    expect(efficiencyFigure({ logged_hours: 0, available_hours: 75, people: 2, pct: 0 }).value).toBeNull();
  });

  it("shows efficiency with the hours behind it", () => {
    expect(efficiencyFigure({ logged_hours: 60, available_hours: 75, people: 2, pct: 80 })).toEqual({ value: "80%", detail: "60 of 75 hours this week" });
  });

  it("explains an empty conversion instead of showing 0%", () => {
    expect(conversionFigure({ accepted: 0, declined: 0, pct: null }).value).toBeNull();
  });

  it("shows conversion with the quotes behind it", () => {
    expect(conversionFigure({ accepted: 3, declined: 1, pct: 75 })).toEqual({ value: "75%", detail: "3 of 4 quotes approved, last 90 days" });
  });
});
