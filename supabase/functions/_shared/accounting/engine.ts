// The sync engine: provider-neutral. It reads Shoplane's data, hands work to
// whichever adapter is connected, and records the outcome.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AccountingProvider, Connection, CustomerInput, ExternalRef, InvoiceInput, ProviderContext, Secrets, WebhookEvent } from "./types.ts";
import { ProviderError } from "./types.ts";
import { getProvider } from "./registry.ts";
import { round2 } from "./util.ts";

const MAX_ATTEMPTS = 5;

type Admin = SupabaseClient;

/** The connection, its secrets and a ready-to-use context for its adapter. */
export async function loadContext(admin: Admin, providerId: string): Promise<{ provider: AccountingProvider; ctx: ProviderContext }> {
  const provider = getProvider(providerId);
  const { data: conn, error } = await admin.from("accounting_connections").select("provider, status, active, org_id, org_name, settings").eq("provider", providerId).single();
  if (error || !conn) throw new Error(`No connection row for ${providerId}`);
  const { data: sec } = await admin.from("accounting_secrets").select("*").eq("provider", providerId).maybeSingle();
  const secrets: Secrets = {
    access_token: sec?.access_token ?? null,
    refresh_token: sec?.refresh_token ?? null,
    token_expires_at: sec?.token_expires_at ?? null,
    webhook_secret: sec?.webhook_secret ?? null,
    extra: (sec?.extra as Record<string, unknown>) ?? {},
  };
  const ctx: ProviderContext = {
    connection: conn as Connection,
    secrets,
    env: (name) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, init),
    async saveSecrets(patch) {
      await admin.from("accounting_secrets").upsert({ provider: providerId, ...patch, updated_at: new Date().toISOString() });
    },
  };
  return { provider, ctx };
}

async function link(admin: Admin, provider: string, entity: string, localId: string): Promise<ExternalRef | null> {
  const { data } = await admin.from("accounting_links").select("external_id, external_number, external_url").eq("provider", provider).eq("entity_type", entity).eq("local_id", localId).maybeSingle();
  return data ? { id: data.external_id, number: data.external_number, url: data.external_url } : null;
}

async function saveLink(admin: Admin, provider: string, entity: string, localId: string, ref: ExternalRef) {
  const { error } = await admin.from("accounting_links").upsert(
    { provider, entity_type: entity, local_id: localId, external_id: ref.id, external_number: ref.number ?? null, external_url: ref.url ?? null, synced_at: new Date().toISOString() },
    { onConflict: "provider,entity_type,local_id" },
  );
  if (error) throw new Error(`Couldn't save the link: ${error.message}`);
}

async function customerFor(admin: Admin, clientId: string): Promise<CustomerInput> {
  const { data: p } = await admin.from("profiles").select("id, full_name, company_name, phone, address").eq("id", clientId).single();
  const { data: user } = await admin.auth.admin.getUserById(clientId);
  return {
    id: clientId,
    name: p?.full_name ?? "",
    company: p?.company_name ?? null,
    email: user?.user?.email ?? null,
    phone: p?.phone ?? null,
    address: p?.address ?? null,
  };
}

/** A Shoplane invoice in the neutral shape adapters take. */
export async function invoiceInput(admin: Admin, invoiceId: string): Promise<{ invoice: InvoiceInput; clientId: string; status: string }> {
  const { data: inv, error } = await admin.from("invoices").select("*").eq("id", invoiceId).single();
  if (error || !inv) throw new ProviderError("The invoice no longer exists in Shoplane.");
  const [{ data: items }, job] = await Promise.all([
    admin.from("invoice_items").select("description, quantity, unit_price, total").eq("invoice_id", invoiceId),
    inv.job_id ? admin.from("jobs").select("ref").eq("id", inv.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const lines = (items ?? []).map((i) => ({
    description: i.description,
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    amount: round2(Number(i.quantity) * Number(i.unit_price)),
  }));
  if (!lines.length) throw new ProviderError("The invoice has no lines to send.");
  return {
    clientId: inv.client_id,
    status: inv.status,
    invoice: {
      id: inv.id,
      number: inv.invoice_number,
      reference: (job as { data: { ref: string } | null }).data?.ref ?? null,
      issue_date: String(inv.created_at).slice(0, 10),
      due_date: inv.due_date,
      currency: inv.currency,
      lines,
      subtotal: Number(inv.subtotal),
      discount: inv.discount_type
        ? { type: inv.discount_type, value: Number(inv.discount_value), amount: Number(inv.discount_amount), reason: inv.discount_reason }
        : null,
      tax_rate: Number(inv.tax_rate),
      tax_amount: Number(inv.tax_amount),
      total: Number(inv.total),
      notes: inv.notes,
    },
  };
}

async function markPaid(admin: Admin, provider: string, invoiceId: string, paidAt: string | null): Promise<boolean> {
  const { data, error } = await admin.rpc("accounting_mark_paid", { _provider: provider, _invoice_id: invoiceId, _paid_at: paidAt });
  if (error) throw new Error(`Couldn't mark the invoice paid: ${error.message}`);
  return !!data;
}

/** The Shoplane invoice an external invoice id belongs to. */
async function localInvoice(admin: Admin, provider: string, externalId: string): Promise<string | null> {
  const { data } = await admin.from("accounting_links").select("local_id").eq("provider", provider).eq("entity_type", "invoice").eq("external_id", externalId).maybeSingle();
  return data?.local_id ?? null;
}

type Job = { id: number; provider: string; entity_type: string; local_id: string | null; external_id: string | null; action: string; attempts: number };

async function runJob(admin: Admin, provider: AccountingProvider, ctx: ProviderContext, job: Job): Promise<Record<string, unknown>> {
  const p = provider.id;
  if (job.entity_type === "invoice" && job.local_id) {
    if (job.action === "upsert") {
      const { invoice, clientId, status } = await invoiceInput(admin, job.local_id);
      if (status === "draft") return { skipped: "still a draft" };
      const customer = await provider.upsertCustomer(ctx, await customerFor(admin, clientId), await link(admin, p, "customer", clientId));
      await saveLink(admin, p, "customer", clientId, customer);
      const existing = await link(admin, p, "invoice", invoice.id);
      const ref = await provider.upsertInvoice(ctx, invoice, customer, existing);
      await saveLink(admin, p, "invoice", invoice.id, ref);
      let sent = false;
      if (!existing && ctx.connection.settings.send_from === "provider" && provider.canSend && provider.sendInvoice) {
        const email = (await customerFor(admin, clientId)).email;
        await provider.sendInvoice(ctx, ref, email);
        sent = true;
      }
      return { external_id: ref.id, number: ref.number ?? null, created: !existing, sent };
    }
    const existing = await link(admin, p, "invoice", job.local_id);
    if (!existing) {
      // Its upsert hasn't run yet; try again shortly.
      throw new ProviderError("Waiting for the invoice to reach the other system first.", true);
    }
    if (job.action === "void") {
      await provider.voidInvoice(ctx, existing);
      return { voided: existing.id };
    }
    if (job.action === "payment") {
      const { data: inv } = await admin.from("invoices").select("total, paid_at, currency").eq("id", job.local_id).single();
      if (await link(admin, p, "payment", job.local_id)) return { skipped: "payment already recorded" };
      const remote = provider.canPoll ? await provider.getInvoiceStatus(ctx, existing) : null;
      if (remote?.paid) return { skipped: "already paid there" };
      const ref = await provider.recordPayment(ctx, existing, Number(inv?.total ?? 0), inv?.paid_at ?? new Date().toISOString(), inv?.currency ?? "USD");
      await saveLink(admin, p, "payment", job.local_id, ref);
      return { payment: ref.id };
    }
  }
  if (job.action === "pull" && job.external_id) {
    const externalInvoices = job.entity_type === "remote_payment" && provider.getPaymentInvoices ? await provider.getPaymentInvoices(ctx, job.external_id) : [job.external_id];
    const marked: string[] = [];
    for (const ext of externalInvoices) {
      const local = await localInvoice(admin, p, ext);
      if (!local) continue;
      const remote = await provider.getInvoiceStatus(ctx, { id: ext });
      if (remote.paid && (await markPaid(admin, p, local, remote.paid_at))) marked.push(local);
    }
    return { checked: externalInvoices.length, marked_paid: marked };
  }
  throw new ProviderError(`Unknown job: ${job.entity_type} ${job.action}`);
}

/** Runs due jobs for the active system, then checks a few unpaid invoices there. */
export async function processQueue(admin: Admin, limit = 25): Promise<{ provider: string | null; done: number; failed: number; retrying: number; reconciled: number }> {
  const { data: active } = await admin.from("accounting_connections").select("provider").eq("active", true).eq("status", "connected").maybeSingle();
  if (!active) return { provider: null, done: 0, failed: 0, retrying: 0, reconciled: 0 };
  const { provider, ctx } = await loadContext(admin, active.provider);
  const { data: jobs, error } = await admin.rpc("accounting_claim_jobs", { _limit: limit });
  if (error) throw new Error(error.message);

  let done = 0, failed = 0, retrying = 0;
  let lastError: string | null = null;
  for (const job of (jobs ?? []) as Job[]) {
    try {
      const result = await runJob(admin, provider, ctx, job);
      await admin.from("accounting_queue").update({ status: "done", result, last_error: null, finished_at: new Date().toISOString() }).eq("id", job.id);
      done++;
    } catch (e) {
      const err = e as Error;
      const retryable = err instanceof ProviderError ? err.retryable : true;
      const giveUp = !retryable || job.attempts >= MAX_ATTEMPTS;
      lastError = err.message;
      await admin.from("accounting_queue").update(
        giveUp
          ? { status: "failed", last_error: err.message, finished_at: new Date().toISOString() }
          : { status: "queued", last_error: err.message, next_attempt_at: new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString() },
      ).eq("id", job.id);
      if (giveUp) failed++;
      else retrying++;
    }
  }

  const reconciled = provider.canPoll ? await reconcile(admin, provider, ctx) : 0;
  // The last error stays visible in Settings until a run finishes cleanly.
  await admin.from("accounting_connections").update({
    last_sync_at: new Date().toISOString(),
    ...(jobs?.length ? { last_error: lastError } : {}),
    updated_at: new Date().toISOString(),
  }).eq("provider", provider.id);
  return { provider: provider.id, done, failed, retrying, reconciled };
}

/** The fallback when a webhook is missed: ask about the unpaid invoices checked longest ago. */
async function reconcile(admin: Admin, provider: AccountingProvider, ctx: ProviderContext, batch = 10): Promise<number> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: links } = await admin
    .from("accounting_links")
    .select("local_id, external_id")
    .eq("provider", provider.id)
    .eq("entity_type", "invoice")
    .lt("synced_at", since)
    .order("synced_at", { ascending: true })
    .limit(50);
  if (!links?.length) return 0;
  const { data: unpaid } = await admin.from("invoices").select("id").in("id", links.map((l) => l.local_id)).in("status", ["sent", "overdue"]);
  const openIds = new Set((unpaid ?? []).map((i) => i.id));
  let marked = 0;
  const open = links.filter((l) => openIds.has(l.local_id)).slice(0, batch);
  for (const l of open) {
    try {
      const remote = await provider.getInvoiceStatus(ctx, { id: l.external_id });
      if (remote.paid && (await markPaid(admin, provider.id, l.local_id, remote.paid_at))) marked++;
    } catch {
      // A reconcile miss is retried on the next run.
    }
    await admin.from("accounting_links").update({ synced_at: new Date().toISOString() }).eq("provider", provider.id).eq("entity_type", "invoice").eq("local_id", l.local_id);
  }
  return marked;
}

/** Turns what a webhook said into work: pulls to check, or payments to record straight away. */
export async function handleWebhookEvents(admin: Admin, providerId: string, events: WebhookEvent[]): Promise<number> {
  let queued = 0;
  for (const e of events) {
    if (e.paid && e.local_invoice_id) {
      await markPaid(admin, providerId, e.local_invoice_id, e.paid_at ?? null);
      continue;
    }
    if (e.paid && e.external_id) {
      const local = await localInvoice(admin, providerId, e.external_id);
      if (local) await markPaid(admin, providerId, local, e.paid_at ?? null);
      continue;
    }
    if (!e.external_id) continue;
    const { error } = await admin.rpc("accounting_enqueue", {
      _provider: providerId,
      _entity: e.kind === "payment" ? "remote_payment" : "remote_invoice",
      _local: null,
      _external: e.external_id,
      _action: "pull",
    });
    if (!error) queued++;
  }
  return queued;
}
