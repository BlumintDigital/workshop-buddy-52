import { supabase } from "@/integrations/supabase/client";
import type { StatusTone } from "@/components/dashboard/StatusPill";

export interface BillingStatus {
  job_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  client_marked_paid: boolean | null;
}

/** The latest invoice on each project, as the shipping and billing teams may see it. */
export async function fetchBillingStatus(jobIds: string[]): Promise<Record<string, BillingStatus>> {
  if (!jobIds.length) return {};
  const { data } = await supabase.rpc("project_billing_status", { _job_ids: jobIds });
  return Object.fromEntries(((data ?? []) as BillingStatus[]).map((b) => [b.job_id, b]));
}

/** How a project stands for payment, in the words Shipping needs before a handover. */
export function billingState(b: BillingStatus | undefined, walkIn: boolean): { label: string; tone: StatusTone; paid: boolean } {
  if (b?.status === "paid") return { label: "Paid", tone: "success", paid: true };
  if (b?.status && b.client_marked_paid) return { label: "Client says paid", tone: "info", paid: false };
  if (b?.status === "sent" || b?.status === "overdue") return { label: b.status === "overdue" ? "Invoice overdue" : "Invoiced, not paid", tone: "warning", paid: false };
  if (b?.status === "draft") return { label: "Invoice not sent", tone: "warning", paid: false };
  if (walkIn) return { label: "Walk-in, bill directly", tone: "neutral", paid: false };
  return { label: "Not invoiced", tone: "warning", paid: false };
}
