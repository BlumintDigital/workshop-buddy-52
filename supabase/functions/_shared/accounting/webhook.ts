// Generic webhook connector: plugs Shoplane into any finance system that
// Shoplane has no adapter for (Sage, FreeAgent, Zoho, a Zapier or Make
// scenario, your own code).
//
// Outbound: each change is POSTed as JSON to the URL set in Settings →
// Integrations, signed with the connection's secret:
//   X-Shoplane-Event: invoice.upserted | invoice.voided | customer.upserted | payment.recorded
//   X-Shoplane-Delivery: <unique id>
//   X-Shoplane-Signature: sha256=<hex HMAC-SHA256 of the raw body>
// The receiver may reply {"id": "...", "number": "...", "url": "..."} so
// Shoplane can show the other system's reference.
//
// Inbound: POST to /functions/v1/accounting-webhook?provider=webhook with the
// same signature header and {"event": "invoice.paid", "invoice_id": "<Shoplane
// invoice id>" | "external_id": "<your id>", "paid_at": "<ISO date>"}.
// See docs/integrations.md.

import type { AccountingProvider, ExternalRef, ProviderContext, WebhookEvent } from "./types.ts";
import { hmacSha256, ProviderError, safeEqual, toHex } from "./util.ts";

export async function signature(secret: string, body: string): Promise<string> {
  return `sha256=${toHex(await hmacSha256(secret, body))}`;
}

async function post(ctx: ProviderContext, event: string, data: unknown, fallbackId: string): Promise<ExternalRef> {
  const url = ctx.connection.settings.url;
  if (!url) throw new ProviderError("Set the webhook URL in Settings → Integrations.");
  if (!ctx.secrets.webhook_secret) throw new ProviderError("The webhook connection has no signing secret. Reconnect it.");
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data });
  const res = await ctx.fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shoplane-Event": event,
      "X-Shoplane-Delivery": crypto.randomUUID(),
      "X-Shoplane-Signature": await signature(ctx.secrets.webhook_secret, body),
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`The webhook answered ${res.status}: ${text.slice(0, 200)}`, res.status === 429 || res.status >= 500);
  let reply: any;
  try {
    reply = text ? JSON.parse(text) : null;
  } catch {
    reply = null;
  }
  return { id: String(reply?.id ?? fallbackId), number: reply?.number ?? null, url: reply?.url ?? null };
}

export const webhook: AccountingProvider = {
  id: "webhook",
  label: "Other system (webhook)",
  requiredEnv: [],
  auth: "secret",
  canSend: false,
  canPoll: false,

  async testConnection(ctx) {
    await post(ctx, "connection.test", { message: "Shoplane is connected." }, "test");
    return { org_name: ctx.connection.settings.url ? new URL(ctx.connection.settings.url).host : null };
  },

  async listOptions() {
    return { tax_codes: [], items: [], accounts: [], payment_accounts: [] };
  },

  upsertCustomer: (ctx, customer, existing) => post(ctx, "customer.upserted", { ...customer, external_id: existing?.id ?? null }, customer.id),
  upsertInvoice: (ctx, invoice, customer, existing) =>
    post(ctx, "invoice.upserted", { ...invoice, customer_external_id: customer.id, external_id: existing?.id ?? null }, invoice.id),
  async voidInvoice(ctx, invoice) {
    await post(ctx, "invoice.voided", { external_id: invoice.id }, invoice.id);
  },
  recordPayment: (ctx, invoice, amount, paidAt, currency) =>
    post(ctx, "payment.recorded", { invoice_external_id: invoice.id, amount, currency, paid_at: paidAt }, `${invoice.id}-payment`),

  async getInvoiceStatus() {
    throw new ProviderError("The webhook connector can't be asked for status; it tells Shoplane instead.");
  },

  async verifyWebhook(ctx, headers, rawBody) {
    const given = headers.get("x-shoplane-signature");
    if (!ctx.secrets.webhook_secret || !given) return false;
    return safeEqual(await signature(ctx.secrets.webhook_secret, rawBody), given);
  },

  parseWebhook(rawBody) {
    const body = JSON.parse(rawBody);
    if (body?.event !== "invoice.paid") return [];
    const event: WebhookEvent = {
      kind: "invoice",
      paid: true,
      paid_at: body.paid_at ?? null,
      ...(body.invoice_id ? { local_invoice_id: String(body.invoice_id) } : {}),
      ...(body.external_id ? { external_id: String(body.external_id) } : {}),
    };
    return event.local_invoice_id || event.external_id ? [event] : [];
  },
};
