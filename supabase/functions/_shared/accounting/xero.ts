// Xero adapter (Accounting API 2.0).
//
// Server secrets: XERO_CLIENT_ID, XERO_CLIENT_SECRET and, for payment
// webhooks, XERO_WEBHOOK_KEY. XERO_SCOPES overrides the requested scopes
// (Xero is moving newer apps to finer-grained scopes).
// Docs: https://developer.xero.com/documentation/api/accounting/overview

import type { AccountingProvider, CustomerInput, ExternalRef, InvoiceInput, Option, ProviderContext, WebhookEvent } from "./types.ts";
import { freshAccessToken, tokenRequest } from "./oauth.ts";
import { displayName, hmacSha256, ProviderError, readJson, round2, safeEqual, toBase64 } from "./util.ts";

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API = "https://api.xero.com/api.xro/2.0";
const DEFAULT_SCOPES = "openid profile email offline_access accounting.transactions accounting.contacts accounting.settings";

async function api(ctx: ProviderContext, method: string, path: string, body?: unknown, what = "Xero"): Promise<any> {
  const tenant = ctx.connection.org_id;
  if (!tenant) throw new ProviderError("Xero isn't connected to an organisation. Reconnect it in Settings → Integrations.");
  const token = await freshAccessToken(ctx, TOKEN_URL, "XERO_CLIENT_ID", "XERO_CLIENT_SECRET");
  const res = await ctx.fetch(`${API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "xero-tenant-id": tenant,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return await readJson(res, what);
}

/** Xero's "/Date(1712345678000+0000)/" to ISO. */
export function xeroDate(value: unknown): string | null {
  const m = /\/Date\((\d+)/.exec(String(value ?? ""));
  return m ? new Date(Number(m[1])).toISOString() : null;
}

/** Builds the Xero invoice. Exported for tests. */
export function invoiceBody(inv: InvoiceInput, contactId: string, settings: ProviderContext["connection"]["settings"], existingId?: string): Record<string, unknown> {
  if (!settings.account_code) throw new ProviderError("Choose the Xero revenue account invoices post to, in Settings → Integrations.");
  const taxType = inv.tax_rate > 0 ? settings.tax_code : settings.tax_code_zero ?? settings.tax_code;
  const percent = inv.discount?.type === "percent" ? inv.discount.value : null;
  const lines: Record<string, unknown>[] = inv.lines.map((l) => ({
    Description: l.description,
    Quantity: l.quantity,
    UnitAmount: l.unit_price,
    AccountCode: settings.account_code,
    ...(taxType ? { TaxType: taxType } : {}),
    ...(percent ? { DiscountRate: percent } : {}),
  }));
  // A fixed-amount discount becomes its own negative line.
  if (inv.discount?.type === "amount" && inv.discount.amount > 0) {
    lines.push({
      Description: inv.discount.reason ?? "Discount",
      Quantity: 1,
      UnitAmount: -round2(inv.discount.amount),
      AccountCode: settings.account_code,
      ...(taxType ? { TaxType: taxType } : {}),
    });
  }
  return {
    ...(existingId ? { InvoiceID: existingId } : {}),
    Type: "ACCREC",
    Contact: { ContactID: contactId },
    Date: inv.issue_date,
    DueDate: inv.due_date ?? inv.issue_date,
    ...(settings.numbering === "shoplane" ? { InvoiceNumber: inv.number } : {}),
    Reference: (inv.reference ? `${inv.reference} · ${inv.number}` : inv.number).slice(0, 255),
    CurrencyCode: inv.currency,
    LineAmountTypes: "Exclusive",
    Status: "AUTHORISED",
    LineItems: lines,
  };
}

const opt = (value: unknown, label: unknown): Option => ({ value: String(value), label: String(label) });

export const xero: AccountingProvider = {
  id: "xero",
  label: "Xero",
  requiredEnv: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
  auth: "oauth2",
  canSend: true,
  canPoll: true,

  authorizeUrl(ctx, state, redirectUri) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: ctx.env("XERO_CLIENT_ID")!,
      redirect_uri: redirectUri,
      scope: ctx.env("XERO_SCOPES") || DEFAULT_SCOPES,
      state,
    });
    return `${AUTHORIZE_URL}?${params}`;
  },

  async exchangeCode(ctx, params, redirectUri) {
    const token = await tokenRequest(ctx.fetch, TOKEN_URL, ctx.env("XERO_CLIENT_ID")!, ctx.env("XERO_CLIENT_SECRET")!, {
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      redirect_uri: redirectUri,
    });
    const res = await ctx.fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" } });
    const tenants = await readJson(res, "Finding the Xero organisation");
    const org = (tenants ?? []).find((t: any) => t.tenantType === "ORGANISATION") ?? tenants?.[0];
    if (!org) throw new ProviderError("No Xero organisation was shared with Shoplane.");
    return {
      org_id: org.tenantId,
      org_name: org.tenantName ?? null,
      secrets: {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      },
    };
  },

  async testConnection(ctx) {
    const body = await api(ctx, "GET", "Organisation", undefined, "Checking the connection");
    return { org_name: body?.Organisations?.[0]?.Name ?? null };
  },

  async listOptions(ctx) {
    const [rates, accounts] = await Promise.all([
      api(ctx, "GET", "TaxRates", undefined, "Listing tax rates"),
      api(ctx, "GET", "Accounts", undefined, "Listing accounts"),
    ]);
    const active = (accounts?.Accounts ?? []).filter((a: any) => a.Status === "ACTIVE");
    return {
      tax_codes: (rates?.TaxRates ?? []).filter((t: any) => t.Status === "ACTIVE").map((t: any) => opt(t.TaxType, `${t.Name} (${t.EffectiveRate ?? t.DisplayTaxRate ?? 0}%)`)),
      items: [],
      accounts: active.filter((a: any) => a.Class === "REVENUE").map((a: any) => opt(a.Code, `${a.Code} · ${a.Name}`)),
      payment_accounts: active.filter((a: any) => a.Type === "BANK" || a.EnablePaymentsToAccount).map((a: any) => opt(a.Code ?? a.AccountID, `${a.Code ? `${a.Code} · ` : ""}${a.Name}`)),
    };
  },

  async upsertCustomer(ctx, c: CustomerInput, existing: ExternalRef | null) {
    const contact: Record<string, unknown> = {
      Name: displayName(c),
      ...(c.email ? { EmailAddress: c.email } : {}),
      ...(c.phone ? { Phones: [{ PhoneType: "DEFAULT", PhoneNumber: c.phone.slice(0, 50) }] } : {}),
      ...(c.address ? { Addresses: [{ AddressType: "STREET", AddressLine1: c.address.slice(0, 500) }] } : {}),
    };
    if (!existing) {
      // Reuse a contact Xero already has with the same email, then the same name.
      const where = c.email ? `EmailAddress=="${c.email.replace(/"/g, "")}"` : `Name=="${String(contact.Name).replace(/"/g, "")}"`;
      const found = await api(ctx, "GET", `Contacts?where=${encodeURIComponent(where)}`, undefined, "Looking up the contact");
      if (found?.Contacts?.[0]) return { id: found.Contacts[0].ContactID };
    }
    const saved = await api(ctx, "POST", "Contacts", { Contacts: [{ ...(existing ? { ContactID: existing.id } : {}), ...contact }] }, existing ? "Updating the contact" : "Creating the contact");
    return { id: saved.Contacts[0].ContactID };
  },

  async upsertInvoice(ctx, inv, customer, existing) {
    const saved = await api(ctx, "POST", "Invoices", { Invoices: [invoiceBody(inv, customer.id, ctx.connection.settings, existing?.id)] }, existing ? "Updating the invoice" : "Creating the invoice");
    const out = saved.Invoices[0];
    return { id: out.InvoiceID, number: out.InvoiceNumber ?? null, url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${out.InvoiceID}` };
  },

  async sendInvoice(ctx, invoice) {
    await api(ctx, "POST", `Invoices/${invoice.id}/Email`, {}, "Emailing the invoice");
  },

  async voidInvoice(ctx, invoice) {
    await api(ctx, "POST", `Invoices/${invoice.id}`, { Invoices: [{ InvoiceID: invoice.id, Status: "VOIDED" }] }, "Voiding the invoice");
  },

  async recordPayment(ctx, invoice, amount, paidAt) {
    const account = ctx.connection.settings.payment_account_code;
    if (!account) throw new ProviderError("Choose the Xero bank account payments go to, in Settings → Integrations.");
    const saved = await api(ctx, "PUT", "Payments", {
      Payments: [{ Invoice: { InvoiceID: invoice.id }, Account: { Code: account }, Amount: round2(amount), Date: paidAt.slice(0, 10) }],
    }, "Recording the payment");
    return { id: saved.Payments[0].PaymentID };
  },

  async getInvoiceStatus(ctx, invoice) {
    const inv = (await api(ctx, "GET", `Invoices/${invoice.id}`, undefined, "Checking the invoice"))?.Invoices?.[0];
    return {
      paid: inv?.Status === "PAID",
      paid_at: xeroDate(inv?.FullyPaidOnDate),
      amount_due: Number(inv?.AmountDue ?? 0),
      voided: inv?.Status === "VOIDED" || inv?.Status === "DELETED",
    };
  },

  async getPaymentInvoices(ctx, paymentId) {
    const payment = (await api(ctx, "GET", `Payments/${paymentId}`, undefined, "Reading the payment"))?.Payments?.[0];
    return payment?.Invoice?.InvoiceID ? [payment.Invoice.InvoiceID] : [];
  },

  async verifyWebhook(ctx, headers, rawBody) {
    const key = ctx.env("XERO_WEBHOOK_KEY");
    const signature = headers.get("x-xero-signature");
    if (!key || !signature) return false;
    return safeEqual(toBase64(await hmacSha256(key, rawBody)), signature);
  },

  parseWebhook(rawBody) {
    const body = JSON.parse(rawBody);
    // An empty event list is Xero's "intent to receive" check; a valid signature is the whole answer.
    return (body?.events ?? [])
      .filter((e: any) => e.eventCategory === "INVOICE")
      .map((e: any): WebhookEvent => ({ kind: "invoice", external_id: String(e.resourceId) }));
  },
};
