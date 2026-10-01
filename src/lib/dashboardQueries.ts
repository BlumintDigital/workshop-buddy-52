// Shared definitions for the counts the dashboards show.
// Every dashboard card and the attention queue read these, so a number can
// never disagree with itself on the same screen.

import { supabase } from "@/integrations/supabase/client";

/** Job statuses that count as open work. */
export const OPEN_JOB_STATUSES = ["pending", "in_progress", "review"] as const;

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

/**
 * Everything the admin and manager Today dashboard needs, from one `dashboard_today` call.
 * It runs as the caller, so row-level security applies exactly as for the separate queries below.
 */
export type DashboardSnapshot = {
  openJobs: { id: string; ref: string; title: string; status: string; priority: string | null; due_date: string | null; estimated_hours: number | null; assigned_staff_id: string | null }[];
  people: { id: string; full_name: string | null }[];
  paidInvoices: { base_total: number | null; total: number | null; paid_at: string | null; created_at: string }[];
  unpaidTotal: number;
  overdueInvoices: OverdueInvoice[];
  draftInvoices: DraftInvoice[];
  appointments: { id: string; title: string | null; appointment_time: string; duration_minutes: number | null; status: string }[];
  reviewCount: number;
  lowStock: LowStockItem[];
  staleQuotes: StaleQuote[];
  pendingInvites: number;
  uninvoicedProjects: UninvoicedProject[];
};

/** Start of the month five months back: the revenue chart covers six calendar months. */
export function revenueWindowStart(now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function fetchDashboardSnapshot(
  opts: { appointments: boolean; invites: boolean },
  now = new Date(),
): Promise<DashboardSnapshot> {
  const { data, error } = await (supabase.rpc as any)("dashboard_today", {
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
    people: d.people ?? [],
    paidInvoices: d.paid_invoices ?? [],
    unpaidTotal: Number(d.unpaid_total) || 0,
    overdueInvoices: (d.overdue_invoices ?? []).map((row: any) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      client_id: row.client_id,
      due_date: row.due_date,
      amount: Number(row.base_total ?? row.total) || 0,
    })),
    draftInvoices: (d.draft_invoices ?? []).map((row: any) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      job_id: row.job_id,
      total: Number(row.base_total ?? row.total) || 0,
    })),
    appointments: d.appointments ?? [],
    reviewCount: Number(d.review_count) || 0,
    lowStock: d.low_stock ?? [],
    staleQuotes: (d.stale_quotes ?? []).map((row: any) => ({
      id: row.id,
      title: `${row.job_ref ?? ""}-${row.kind === "quote" ? "Q" : "CR"}${row.number} · ${row.job_title ?? ""}`,
      quoted_total: row.subtotal,
      days: Math.floor((now.getTime() - new Date(row.sent_at ?? now).getTime()) / 86_400_000),
    })),
    pendingInvites: Number(d.pending_invites) || 0,
    uninvoicedProjects: d.uninvoiced_projects ?? [],
  };
}

export type UninvoicedProject = { id: string; ref: string | null; title: string; client_id: string | null };
