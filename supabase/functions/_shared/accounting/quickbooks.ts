// QuickBooks Online adapter (Accounting API v3).
//
// Server secrets: QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
// QUICKBOOKS_ENVIRONMENT ("sandbox" or "production", default sandbox) and,
// for payment webhooks, QUICKBOOKS_WEBHOOK_VERIFIER.
// Docs: https://developer.intuit.com/app/developer/qbo/docs/api/accounting

import type { AccountingProvider, CustomerInput, ExternalRef, InvoiceInput, Option, ProviderContext, WebhookEvent } from "./types.ts";
import { freshAccessToken, tokenRequest } from "./oauth.ts";
import { displayName, hmacSha256, ProviderError, readJson, round2, safeEqual, toBase64 } from "./util.ts";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";
const MINOR_VERSION = "75";

const production = (env: (n: string) => string | undefined) => env("QUICKBOOKS_ENVIRONMENT") === "production";
const apiBase = (env: (n: string) => string | undefined) =>
  production(env) ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
const appBase = (env: (n: string) => string | undefined) => (production(env) ? "https://app.qbo.intuit.com" : "https://app.sandbox.qbo.intuit.com");

/** Calls the company's API with a fresh token. */
async function api(ctx: ProviderContext, method: string, path: string, body?: unknown, what = "QuickBooks"): Promise<any> {
  const realm = ctx.connection.org_id;
  if (!realm) throw new ProviderError("QuickBooks isn't connected to a company. Reconnect it in Settings → Integrations.");
  const token = await freshAccessToken(ctx, TOKEN_URL, "QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET");
  const sep = path.includes("?") ? "&" : "?";
  const res = await ctx.fetch(`${apiBase(ctx.env)}/v3/company/${realm}/${path}${sep}minorversion=${MINOR_VERSION}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return await readJson(res, what);
}

/** QuickBooks query language; single quotes are escaped with a backslash. */
const q = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function query(ctx: ProviderContext, sql: string, entity: string): Promise<any[]> {
  const body = await api(ctx, "GET", `query?query=${encodeURIComponent(sql)}`, undefined, `Looking up ${entity}`);
  return body?.QueryResponse?.[entity] ?? [];
}

/** Builds the QuickBooks invoice body. Exported for tests. */
export function invoiceBody(inv: InvoiceInput, customerId: string, settings: ProviderContext["connection"]["settings"]): Record<string, unknown> {
  if (!settings.item_id) throw new ProviderError("Choose the QuickBooks product or service invoices post to, in Settings → Integrations.");
  const taxCode = inv.tax_rate > 0 ? settings.tax_code : settings.tax_code_zero ?? settings.tax_code;
  const lines: Record<string, unknown>[] = inv.lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: round2(l.amount),
    Description: l.description,
    SalesItemLineDetail: {
      ItemRef: { value: settings.item_id },
      Qty: l.quantity,
      UnitPrice: l.unit_price,
      ...(taxCode ? { TaxCodeRef: { value: taxCode } } : {}),
    },
  }));
  if (inv.discount && inv.discount.amount > 0) {
    lines.push({
      DetailType: "DiscountLineDetail",
      Amount: round2(inv.discount.amount),
      Description: inv.discount.reason ?? "Discount",
      DiscountLineDetail: inv.discount.type === "percent" ? { PercentBased: true, DiscountPercent: inv.discount.value } : { PercentBased: false },
    });
  }
  return {
    CustomerRef: { value: customerId },
    Line: lines,
    TxnDate: inv.issue_date,
    ...(inv.due_date ? { DueDate: inv.due_date } : {}),
    ...(settings.numbering === "shoplane" ? { DocNumber: inv.number.slice(0, 21) } : {}),
    PrivateNote: `Shoplane ${inv.number}${inv.reference ? ` · ${inv.reference}` : ""}`,
    ...(inv.notes ? { CustomerMemo: { value: inv.notes.slice(0, 1000) } } : {}),
    // Non-US companies with per-line tax codes calculate tax on top of the prices.
    ...(taxCode && taxCode !== "TAX" && taxCode !== "NON" ? { GlobalTaxCalculation: "TaxExcluded" } : {}),
  };
}

const opt = (value: unknown, label: unknown): Option => ({ value: String(value), label: String(label) });

export const quickbooks: AccountingProvider = {
  id: "quickbooks",
  label: "QuickBooks Online",
  requiredEnv: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
  auth: "oauth2",
  canSend: true,
  canPoll: true,

  authorizeUrl(ctx, state, redirectUri) {
    const params = new URLSearchParams({ client_id: ctx.env("QUICKBOOKS_CLIENT_ID")!, response_type: "code", scope: SCOPE, redirect_uri: redirectUri, state });
    return `${AUTHORIZE_URL}?${params}`;
  },

  async exchangeCode(ctx, params, redirectUri) {
    const realm = params.get("realmId");
    if (!realm) throw new ProviderError("QuickBooks didn't say which company was connected.");
    const token = await tokenRequest(ctx.fetch, TOKEN_URL, ctx.env("QUICKBOOKS_CLIENT_ID")!, ctx.env("QUICKBOOKS_CLIENT_SECRET")!, {
      grant_type: "authorization_code",
      code: params.get("code") ?? "",
      redirect_uri: redirectUri,
    });
    let orgName: string | null = null;
    const info = await ctx.fetch(`${apiBase(ctx.env)}/v3/company/${realm}/companyinfo/${realm}?minorversion=${MINOR_VERSION}`, {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
    });
    if (info.ok) orgName = (await info.json())?.CompanyInfo?.CompanyName ?? null;
    return {
      org_id: realm,
      org_name: orgName,
      secrets: {
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      },
    };
  },

  async testConnection(ctx) {
    const realm = ctx.connection.org_id;
    const body = await api(ctx, "GET", `companyinfo/${realm}`, undefined, "Checking the connection");
    return { org_name: body?.CompanyInfo?.CompanyName ?? null };
  },

  async listOptions(ctx) {
    const [taxCodes, items, accounts] = await Promise.all([
      query(ctx, "select * from TaxCode where Active = true maxresults 200", "TaxCode"),
      query(ctx, "select * from Item where Active = true maxresults 500", "Item"),
      query(ctx, "select * from Account where AccountType = 'Bank' and Active = true maxresults 200", "Account"),
    ]);
    return {
      tax_codes: taxCodes.map((t) => opt(t.Id, t.Name)),
      items: items.filter((i) => ["Service", "NonInventory", "Inventory"].includes(i.Type)).map((i) => opt(i.Id, i.FullyQualifiedName ?? i.Name)),
      accounts: [],
      payment_accounts: accounts.map((a) => opt(a.Id, a.Name)),
    };
  },

  async upsertCustomer(ctx, c: CustomerInput, existing: ExternalRef | null) {
    const name = displayName(c);
    const fields = {
      DisplayName: name,
      ...(c.company ? { CompanyName: c.company.slice(0, 100) } : {}),
      ...(c.email ? { PrimaryEmailAddr: { Address: c.email } } : {}),
      ...(c.phone ? { PrimaryPhone: { FreeFormNumber: c.phone.slice(0, 30) } } : {}),
      ...(c.address ? { BillAddr: { Line1: c.address.slice(0, 500) } } : {}),
    };
    if (existing) {
      const current = (await api(ctx, "GET", `customer/${existing.id}`, undefined, "Reading the customer"))?.Customer;
      if (current) {
        const saved = await api(ctx, "POST", "customer", { ...fields, Id: current.Id, SyncToken: current.SyncToken, sparse: true }, "Updating the customer");
        return { id: String(saved.Customer.Id) };
      }
    }
    // Reuse a customer QuickBooks already has under the same name.
    const found = await query(ctx, `select * from Customer where DisplayName = '${q(name)}'`, "Customer");
    if (found[0]) return { id: String(found[0].Id) };
    const created = await api(ctx, "POST", "customer", fields, "Creating the customer");
    return { id: String(created.Customer.Id) };
  },

  async upsertInvoice(ctx, inv, customer, existing) {
    const body = invoiceBody(inv, customer.id, ctx.connection.settings);
    let saved;
    if (existing) {
      const current = (await api(ctx, "GET", `invoice/${existing.id}`, undefined, "Reading the invoice"))?.Invoice;
      saved = await api(ctx, "POST", "invoice", { ...body, Id: current.Id, SyncToken: current.SyncToken }, "Updating the invoice");
    } else {
      saved = await api(ctx, "POST", "invoice", body, "Creating the invoice");
    }
    const id = String(saved.Invoice.Id);
    return { id, number: saved.Invoice.DocNumber ?? null, url: `${appBase(ctx.env)}/app/invoice?txnId=${id}` };
  },

  async sendInvoice(ctx, invoice, email) {
    const path = `invoice/${invoice.id}/send${email ? `?sendTo=${encodeURIComponent(email)}` : ""}`;
    await api(ctx, "POST", path, undefined, "Emailing the invoice");
  },

  async voidInvoice(ctx, invoice) {
    const current = (await api(ctx, "GET", `invoice/${invoice.id}`, undefined, "Reading the invoice"))?.Invoice;
    await api(ctx, "POST", "invoice?operation=void", { Id: current.Id, SyncToken: current.SyncToken }, "Voiding the invoice");
  },

  async recordPayment(ctx, invoice, amount, paidAt) {
    const current = (await api(ctx, "GET", `invoice/${invoice.id}`, undefined, "Reading the invoice"))?.Invoice;
    const account = ctx.connection.settings.payment_account_code;
    const saved = await api(ctx, "POST", "payment", {
      CustomerRef: current.CustomerRef,
      TotalAmt: round2(amount),
      TxnDate: paidAt.slice(0, 10),
      ...(account ? { DepositToAccountRef: { value: account } } : {}),
      Line: [{ Amount: round2(amount), LinkedTxn: [{ TxnId: String(current.Id), TxnType: "Invoice" }] }],
    }, "Recording the payment");
    return { id: String(saved.Payment.Id) };
  },

  async getInvoiceStatus(ctx, invoice) {
    const current = (await api(ctx, "GET", `invoice/${invoice.id}`, undefined, "Checking the invoice"))?.Invoice;
    const total = Number(current?.TotalAmt ?? 0);
    const balance = Number(current?.Balance ?? 0);
    const voided = /voided/i.test(String(current?.PrivateNote ?? "")) && total === 0;
    return { paid: !voided && total > 0 && balance === 0, paid_at: null, amount_due: balance, voided };
  },

  async getPaymentInvoices(ctx, paymentId) {
    const payment = (await api(ctx, "GET", `payment/${paymentId}`, undefined, "Reading the payment"))?.Payment;
    return (payment?.Line ?? []).flatMap((l: any) => (l.LinkedTxn ?? []).filter((t: any) => t.TxnType === "Invoice").map((t: any) => String(t.TxnId)));
  },

  async verifyWebhook(ctx, headers, rawBody) {
    const verifier = ctx.env("QUICKBOOKS_WEBHOOK_VERIFIER");
    const signature = headers.get("intuit-signature");
    if (!verifier || !signature) return false;
    return safeEqual(toBase64(await hmacSha256(verifier, rawBody)), signature);
  },

  parseWebhook(rawBody) {
    const body = JSON.parse(rawBody);
    const events: WebhookEvent[] = [];
    for (const n of body?.eventNotifications ?? []) {
      for (const e of n?.dataChangeEvent?.entities ?? []) {
        if (e.name === "Payment") events.push({ kind: "payment", external_id: String(e.id) });
        if (e.name === "Invoice") events.push({ kind: "invoice", external_id: String(e.id) });
      }
    }
    return events;
  },
};
