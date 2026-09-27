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

/** Quotes and change requests sent to clients and still undecided after a few days. */
export async function fetchStaleQuotes(now = new Date()): Promise<StaleQuote[]> {
  const cutoff = new Date(now.getTime() - STALE_QUOTE_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("project_quotes")
    .select("id, kind, number, subtotal, sent_at, jobs(ref, title)")
    .eq("status", "sent")
    .lt("sent_at", cutoff)
    .order("sent_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    title: `${row.jobs?.ref ?? ""}-${row.kind === "quote" ? "Q" : "CR"}${row.number} · ${row.jobs?.title ?? ""}`,
    quoted_total: row.subtotal,
    days: Math.floor((now.getTime() - new Date(row.sent_at ?? now).getTime()) / 86_400_000),
  }));
}

export async function countPendingInvites(): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("invited_at", "is", null)
    .is("invite_accepted_at", null);
  if (error) throw error;
  return count || 0;
}

export type DraftInvoice = { id: string; invoice_number: string; job_id: string | null; total: number };

/** Invoices drafted (by hand or at quality-check pass) and not sent yet. */
export async function fetchDraftInvoices(): Promise<DraftInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, job_id, total, base_total")
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, invoice_number: row.invoice_number, job_id: row.job_id, total: Number(row.base_total ?? row.total) || 0 }));
}

export type UninvoicedProject = { id: string; ref: string | null; title: string; client_id: string | null };

/** Projects that passed their quality check (or shipped) with no invoice at all. */
export async function fetchUninvoicedProjects(): Promise<UninvoicedProject[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, ref, title, client_id, updated_at, invoices(id, status)")
    .in("status", ["completed", "shipped"])
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data || [])
    .filter((j) => !(j.invoices ?? []).some((i) => i.status !== "cancelled"))
    .map((j) => ({ id: j.id, ref: j.ref, title: j.title, client_id: j.client_id }));
}
