// The Today "To do" summary and the two ratio figures, as pure functions so they can be tested.
// Every count comes from the server (dashboard_today); nothing here counts a capped list.

import type { DashboardSnapshot, Efficiency, QuoteConversion } from "@/lib/dashboardQueries";

export type TodoSeverity = "danger" | "warning" | "info";

export type TodoItem = {
  id: string;
  severity: TodoSeverity;
  /** Short state label shown as a pill, so severity never relies on colour alone. */
  label: string;
  /** Exact number of things this line covers; null for one-off items like setting up 2FA. */
  count: number | null;
  title: string;
  meta?: string;
  /** The filtered list this line opens. */
  to: string;
};

export const SEVERITY_ORDER: Record<TodoSeverity, number> = { danger: 0, warning: 1, info: 2 };

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function listPreview(values: string[], total = values.length, max = 3): string {
  const shown = values.slice(0, max);
  const more = total - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000));
}

export type TodoOptions = {
  role: "admin" | "manager";
  mfaEnabled: boolean;
  /** Billing permission: invoice amounts are shown. */
  canSeeMoney: boolean;
  /** Reports permission: project costs and profit are shown. */
  canSeeCosts: boolean;
  format: (n: number) => string;
  today: string;
};

/** One line per kind of work waiting, most severe first. Kinds with nothing waiting are left out. */
export function buildTodoItems(s: DashboardSnapshot, o: TodoOptions): TodoItem[] {
  const base = `/${o.role}`;
  const items: TodoItem[] = [];
  const money = (n: number) => (o.canSeeMoney ? ` · ${o.format(n)}` : "");

  const overdue = s.overdueInvoices;
  if (overdue.length > 0) {
    items.push({
      id: "overdue-invoices",
      severity: "danger",
      label: "Overdue",
      count: overdue.length,
      title: `${plural(overdue.length, "Invoice", "Invoices")} overdue${money(overdue.reduce((sum, i) => sum + i.amount, 0))}`,
      meta: listPreview(
        overdue.map((i) => (i.due_date ? `${i.invoice_number ?? "Invoice"} (${daysBetween(i.due_date, o.today)} days)` : i.invoice_number ?? "Invoice")),
      ),
      to: `${base}/invoices?status=overdue`,
    });
  }

  if (o.canSeeCosts && s.atRiskCount > 0) {
    items.push({
      id: "at-risk",
      severity: "danger",
      label: "At risk",
      count: s.atRiskCount,
      title: `${plural(s.atRiskCount, "Project", "Projects")} at risk or losing money`,
      meta: "Forecast cost is above the price, or it finished at a loss in the last 30 days",
      to: `${base}/projects?status=at_risk`,
    });
  }

  if (s.uninvoicedCount > 0) {
    items.push({
      id: "uninvoiced-projects",
      severity: "warning",
      label: "To invoice",
      count: s.uninvoicedCount,
      title: `Finished ${plural(s.uninvoicedCount, "project", "projects")} with no invoice`,
      meta: listPreview(
        s.uninvoicedPreview.map((p) => (p.ref ? `${p.ref} ${p.title}` : p.title) + (p.client_id ? "" : " (walk-in)")),
        s.uninvoicedCount,
      ),
      to: `${base}/projects?status=uninvoiced`,
    });
  }

  if (s.reviewCount > 0) {
    items.push({
      id: "review-jobs",
      severity: "warning",
      label: "Quality check",
      count: s.reviewCount,
      title: `${plural(s.reviewCount, "Project", "Projects")} waiting for quality check`,
      meta: "Every task is done. Check the work and send it on to shipping",
      to: `${base}/projects?status=review`,
    });
  }

  if (s.poApprovalCount > 0) {
    items.push({
      id: "po-approval",
      severity: "warning",
      label: "Approval",
      count: s.poApprovalCount,
      title: `Purchase ${plural(s.poApprovalCount, "order", "orders")} waiting for approval`,
      to: "/inventory/purchases?filter=approval",
    });
  }

  if (s.stuckCount > 0) {
    items.push({
      id: "stuck-projects",
      severity: "warning",
      label: "Stuck",
      count: s.stuckCount,
      title: `${plural(s.stuckCount, "Project", "Projects")} in the same stage for over 7 days`,
      to: `${base}/projects?status=stuck`,
    });
  }

  if (s.lowStock.length > 0) {
    items.push({
      id: "low-stock",
      severity: "warning",
      label: "Low stock",
      count: s.lowStock.length,
      title: `${plural(s.lowStock.length, "Item", "Items")} at or below reorder level`,
      meta: listPreview(s.lowStock.map((i) => `${i.name} (${i.quantity}${i.unit ? ` ${i.unit}` : ""} left)`)),
      to: "/inventory/stock",
    });
  }

  if (s.shipWaitingCount > 0) {
    items.push({
      id: "ship-waiting",
      severity: "info",
      label: "Hand-over",
      count: s.shipWaitingCount,
      title: `Ready to ship with no hand-over arranged`,
      meta: "Tell the client, then book a collection or courier",
      to: "/shipping",
    });
  }

  if (s.draftInvoices.length > 0) {
    items.push({
      id: "draft-invoices",
      severity: "info",
      label: "Draft",
      count: s.draftInvoices.length,
      title: `Draft ${plural(s.draftInvoices.length, "invoice", "invoices")} to send${money(s.draftInvoices.reduce((sum, d) => sum + d.total, 0))}`,
      meta: listPreview(s.draftInvoices.map((d) => d.invoice_number)),
      to: `${base}/invoices?status=draft`,
    });
  }

  if (s.staleQuotes.length > 0) {
    const oldest = s.staleQuotes[0];
    items.push({
      id: "stale-quotes",
      severity: "info",
      label: "Quote sent",
      count: s.staleQuotes.length,
      title: `${plural(s.staleQuotes.length, "Quote", "Quotes")} waiting on the client`,
      meta: `Oldest: ${oldest.title}${o.canSeeMoney && oldest.quoted_total != null ? ` · ${o.format(oldest.quoted_total)}` : ""} · ${oldest.days} days`,
      to: `${base}/projects?status=quote`,
    });
  }

  if (o.role === "admin" && s.pendingInvites > 0) {
    items.push({
      id: "pending-invites",
      severity: "info",
      label: "Invites",
      count: s.pendingInvites,
      title: `${plural(s.pendingInvites, "Invite", "Invites")} not accepted yet`,
      meta: "Resend from Users if someone missed the email",
      to: "/admin/users",
    });
  }

  if (!o.mfaEnabled) {
    items.push({
      id: "enable-2fa",
      severity: "warning",
      label: "Account",
      count: null,
      title: "Turn on two-factor sign-in",
      meta: "Required for admins and managers. Takes about 2 minutes",
      to: "/profile",
    });
  }

  return sortTodo(items);
}

export function sortTodo(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** A figure for a ratio card: the value, or null with a reason when there is nothing to show yet. */
export type RatioFigure = { value: string | null; detail: string };

const hours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function efficiencyFigure(e: Efficiency): RatioFigure {
  if (e.people === 0) return { value: null, detail: "Add technicians to see this" };
  if (e.pct === null || e.logged_hours === 0) return { value: null, detail: "No hours logged this week yet" };
  return { value: `${e.pct}%`, detail: `${hours(e.logged_hours)} of ${hours(e.available_hours)} hours this week` };
}

export function conversionFigure(q: QuoteConversion): RatioFigure {
  const decided = q.accepted + q.declined;
  if (decided === 0 || q.pct === null) return { value: null, detail: "No quotes decided in the last 90 days" };
  return { value: `${q.pct}%`, detail: `${q.accepted} of ${decided} ${plural(decided, "quote", "quotes")} approved, last 90 days` };
}
