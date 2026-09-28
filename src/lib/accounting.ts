import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage } from "@/lib/friendlyError";

export type ProviderId = "quickbooks" | "xero" | "webhook" | "test";

export interface AccountingConnection {
  provider: ProviderId;
  status: "disconnected" | "connected" | "error";
  active: boolean;
  org_id: string | null;
  org_name: string | null;
  settings: Record<string, string | undefined>;
  connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  auth: "oauth2" | "secret" | "none";
  can_send: boolean;
  can_poll: boolean;
  required_env: string[];
  missing_env: string[];
  webhook_ready: boolean;
  connection: AccountingConnection | null;
}

export interface SyncJob {
  id: number;
  provider: ProviderId;
  entity_type: string;
  local_id: string | null;
  external_id: string | null;
  action: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  last_error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
}

export interface AccountingStatus {
  redirect_uri: string;
  webhook_url: string;
  providers: ProviderInfo[];
  queue: { pending: number; failed: number };
  log: SyncJob[];
}

export interface Option {
  value: string;
  label: string;
}
export interface ProviderOptions {
  tax_codes: Option[];
  items: Option[];
  accounts: Option[];
  payment_accounts: Option[];
}

/** Calls the accounting edge function, turning its error into a readable message. */
export async function accountingCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("accounting", { body });
  if (error) throw new Error(await friendlyErrorMessage(error, "The accounting connection didn't respond"));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/**
 * Pushes queued changes now instead of waiting for the next sync. Fire and
 * forget: the change is already queued and will be retried if this fails.
 */
export function kickAccountingSync() {
  void supabase.functions.invoke("accounting", { body: { action: "sync" } }).catch(() => undefined);
}

export const PROVIDER_BLURB: Record<ProviderId, string> = {
  quickbooks: "Invoices go to QuickBooks Online, which can number and email them. Payments recorded in QuickBooks mark the invoice paid here.",
  xero: "Invoices go to Xero, which can number and email them. Payments recorded in Xero mark the invoice paid here.",
  webhook: "Sends invoices and payments to any other system (Sage, FreeAgent, Zapier, your own code) as signed JSON, and accepts paid notices back.",
  test: "A pretend accounting system for trying the connection. Nothing leaves Shoplane.",
};

export interface InvoiceAccounting {
  provider: ProviderId;
  org_name: string | null;
  external_number: string | null;
  external_url: string | null;
  synced_at: string | null;
  job_status: SyncJob["status"] | null;
  job_error: string | null;
  job_attempts: number | null;
  send_from: "provider" | "shoplane";
}

/** Where one invoice stands in the connected system (null when none is connected). */
export async function loadInvoiceAccounting(invoiceId: string): Promise<InvoiceAccounting | null> {
  const { data } = await supabase.rpc("accounting_invoice_status", { _invoice_id: invoiceId });
  return ((data ?? [])[0] as InvoiceAccounting | undefined) ?? null;
}

export const PROVIDER_LABEL: Record<ProviderId, string> = { quickbooks: "QuickBooks", xero: "Xero", webhook: "the connected system", test: "the test books" };
