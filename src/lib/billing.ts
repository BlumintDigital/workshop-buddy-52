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

/** The workshop's "Payment before hand-over" setting. mark_shipped enforces it again in the database. */
export type HandoverPayment = "off" | "warn" | "block";

export async function fetchHandoverPayment(): Promise<HandoverPayment> {
  const { data } = await supabase.rpc("handover_payment_policy");
  return data === "off" || data === "block" ? data : "warn";
}

export type BillingState = { label: string; tone: StatusTone; paid: boolean; needsReason: boolean; blocked: boolean };

/**
 * How a project stands for payment, in the words Shipping needs before a handover.
 * needsReason: staff must say why it leaves unpaid. blocked: only an admin can let it go, with a reason.
 * Mirrors the check in mark_shipped (supabase/migrations/20261118200000_handover_payment.sql).
 */
export function billingState(b: BillingStatus | undefined, walkIn: boolean, policy: HandoverPayment = "warn"): BillingState {
  const unpaid = (label: string, tone: StatusTone): BillingState => {
    const clientSaysPaid = !!(b?.status && b.client_marked_paid);
    // A walk-in can't be invoiced in the portal, so Block can only ask for a reason.
    const blocked = policy === "block" && !(walkIn && !b?.status);
    return { label, tone, paid: false, needsReason: policy !== "off" && !blocked && !clientSaysPaid, blocked };
  };
  if (b?.status === "paid") return { label: "Paid", tone: "success", paid: true, needsReason: false, blocked: false };
  if (b?.status && b.client_marked_paid) return unpaid("Client says paid. Check and confirm.", "info");
  if (b?.status === "sent" || b?.status === "overdue") return unpaid(b.status === "overdue" ? "Invoice overdue" : "Invoiced, not paid", "warning");
  if (b?.status === "draft") return unpaid("Invoice not sent", "warning");
  if (walkIn) return unpaid("Walk-in, bill directly", "neutral");
  return unpaid("Not invoiced", "warning");
}
