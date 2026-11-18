// Shared definitions for the counts the dashboards show.
// Every dashboard card and the To do summary read these, so a number can
// never disagree with itself on the same screen.

import { supabase } from "@/integrations/supabase/client";

/** The job status used when a technician hands work back for sign-off. */
export const REVIEW_JOB_STATUS = "review";

/** Days a sent quote can sit without a client decision before it is flagged. */
export const STALE_QUOTE_DAYS = 3;

export function todayIso(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // Local calendar date, not UTC, so "today" matches what the user sees.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * PostgREST `or` filter for overdue invoices: explicitly marked overdue, or
 * sent and past their due date. Drafts, paid and cancelled invoices never count.
 */
export function overdueInvoiceFilter(today = todayIso()): string {
  return `status.eq.overdue,and(status.eq.sent,due_date.lt.${today})`;
}

export type OverdueInvoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  due_date: string | null;
  amount: number;
};

export async function fetchOverdueInvoices(): Promise<OverdueInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, client_id, due_date, total, base_total")
    .or(overdueInvoiceFilter())
    .order("due_date", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    client_id: row.client_id,
    due_date: row.due_date,
    // Prefer base_total (workshop currency), fall back to total for legacy rows
    amount: Number(row.base_total ?? row.total) || 0,
  }));
}

export type LowStockItem = { id: string; name: string; quantity: number; min_stock: number; unit: string | null };

export async function fetchLowStockItems(): Promise<LowStockItem[]> {
  const { data, error } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, min_stock, unit");
  if (error) throw error;
  return ((data || []) as LowStockItem[])
    .filter((i) => i.quantity <= i.min_stock)
    .sort((a, b) => a.quantity - a.min_stock - (b.quantity - b.min_stock));
}

export async function countReviewJobs(): Promise<number> {
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", REVIEW_JOB_STATUS);
  if (error) throw error;
  return count || 0;
}

export type StaleQuote = { id: string; title: string; quoted_total: number | null; days: number };

export type DraftInvoice = { id: string; invoice_number: string; job_id: string | null; total: number };

export type UninvoicedProject = { id: string; ref: string | null; title: string; client_id: string | null };

/** One person's load: open tasks assigned to them, estimated hours left on those, hours logged this week. */
export type TeamLoadEntry = { id: string; name: string; tasks: number; remaining_hours: number; logged_hours: number };

/** Ratios worked out on the server. `pct` is null when there is nothing to divide by. */
export type Efficiency = { logged_hours: number; available_hours: number; people: number; pct: number | null };
export type QuoteConversion = { accepted: number; declined: number; pct: number | null };

/**
 * Everything the admin and manager Today dashboard needs, from one `dashboard_today` call.
 * It runs as the caller, so row-level security applies exactly as for the separate queries above.
 * Every count is exact; the lists are previews.
 */
export type DashboardSnapshot = {
  openJobs: { id: string; ref: string; title: string; status: string; priority: string | null; due_date: string | null; assignee: string | null }[];
  openCount: number;
  intakeCount: number;
  dueCount: number;
  reviewCount: number;
  teamLoad: TeamLoadEntry[];
  efficiency: Efficiency;
  quoteConversion: QuoteConversion;
  paidInvoices: { base_total: number | null; total: number | null; paid_at: string | null; created_at: string }[];
  unpaidTotal: number;
  overdueInvoices: OverdueInvoice[];
  draftInvoices: DraftInvoice[];
  appointments: { id: string; title: string | null; appointment_time: string; duration_minutes: number | null; status: string }[];
  lowStock: LowStockItem[];
  staleQuotes: StaleQuote[];
  pendingInvites: number;
  uninvoicedCount: number;
  uninvoicedPreview: UninvoicedProject[];
  poApprovalCount: number;
  shipWaitingCount: number;
  stuckCount: number;
  atRiskCount: number;
};

/** Start of the month five months back: the revenue chart covers six calendar months. */
export function revenueWindowStart(now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const num = (v: unknown) => Number(v) || 0;
const pct = (v: unknown) => (v == null ? null : Number(v));

export async function fetchDashboardSnapshot(
  opts: { appointments: boolean; invites: boolean },
  now = new Date(),
): Promise<DashboardSnapshot> {
  const { data, error } = await supabase.rpc("dashboard_today", {
    p_today: todayIso(now),
    p_paid_since: revenueWindowStart(now).toISOString(),
    p_stale_quote_before: new Date(now.getTime() - STALE_QUOTE_DAYS * 86_400_000).toISOString(),
    p_include_appointments: opts.appointments,
    p_include_invites: opts.invites,
  });
  if (error) throw error;
  const d = data as any;
  return {
    openJobs: d.open_jobs ?? [],
    openCount: num(d.open_count),
    intakeCount: num(d.intake_count),
    dueCount: num(d.due_count),
    reviewCount: num(d.review_count),
    teamLoad: (d.team_load ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      tasks: num(t.tasks),
      remaining_hours: num(t.remaining_hours),
      logged_hours: num(t.logged_hours),
    })),
    efficiency: {
      logged_hours: num(d.efficiency?.logged_hours),
      available_hours: num(d.efficiency?.available_hours),
      people: num(d.efficiency?.people),
      pct: pct(d.efficiency?.pct),
    },
    quoteConversion: {
      accepted: num(d.quote_conversion?.accepted),
      declined: num(d.quote_conversion?.declined),
      pct: pct(d.quote_conversion?.pct),
    },
    paidInvoices: d.paid_invoices ?? [],
    unpaidTotal: num(d.unpaid_total),
    overdueInvoices: (d.overdue_invoices ?? []).map((row: any) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      client_id: row.client_id,
      due_date: row.due_date,
      amount: num(row.base_total ?? row.total),
    })),
    draftInvoices: (d.draft_invoices ?? []).map((row: any) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      job_id: row.job_id,
      total: num(row.base_total ?? row.total),
    })),
    appointments: d.appointments ?? [],
    lowStock: d.low_stock ?? [],
    staleQuotes: (d.stale_quotes ?? []).map((row: any) => ({
      id: row.id,
      title: `${row.job_ref ?? ""}-${row.kind === "quote" ? "Q" : "CR"}${row.number} · ${row.job_title ?? ""}`,
      quoted_total: row.subtotal,
      days: Math.floor((now.getTime() - new Date(row.sent_at ?? now).getTime()) / 86_400_000),
    })),
    pendingInvites: num(d.pending_invites),
    uninvoicedCount: num(d.uninvoiced_count),
    uninvoicedPreview: d.uninvoiced_preview ?? [],
    poApprovalCount: num(d.po_approval_count),
    shipWaitingCount: num(d.ship_waiting_count),
    stuckCount: num(d.stuck_count),
    atRiskCount: num(d.at_risk_count),
  };
}
