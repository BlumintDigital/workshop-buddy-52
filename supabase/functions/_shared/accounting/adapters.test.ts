// Adapter tests: request bodies, signatures, webhook parsing and token refresh.
// Run with: npm run test:accounting  (deno test)

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { invoiceBody as qboInvoice, quickbooks } from "./quickbooks.ts";
import { invoiceBody as xeroInvoice, xero, xeroDate } from "./xero.ts";
import { signature, webhook } from "./webhook.ts";
import { simulatePayment, test as testProvider } from "./test.ts";
import { hmacSha256, toBase64, toHex } from "./util.ts";
import type { InvoiceInput, ProviderContext, Secrets } from "./types.ts";

const invoice = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  id: "inv-1",
  number: "INV-20260928-AB12",
  reference: "EDL-202609-004",
  issue_date: "2026-09-28",
  due_date: "2026-10-28",
  currency: "GBP",
  lines: [
    { description: "Rewind stator", quantity: 1, unit_price: 350, amount: 350 },
    { description: "Labour", quantity: 2, unit_price: 25, amount: 50 },
  ],
  subtotal: 400,
  discount: null,
  tax_rate: 20,
  tax_amount: 80,
  total: 480,
  notes: "Thanks for your business",
  ...over,
});

function ctx(over: Partial<ProviderContext> = {}, env: Record<string, string> = {}): ProviderContext {
  const secrets: Secrets = { access_token: "tok", refresh_token: "ref", token_expires_at: new Date(Date.now() + 3_600_000).toISOString(), webhook_secret: "whsec", extra: {} };
  return {
    connection: { provider: "quickbooks", status: "connected", active: true, org_id: "123", org_name: "Acme", settings: { item_id: "7", tax_code: "20", tax_code_zero: "ZR", account_code: "200", payment_account_code: "090" } },
    secrets,
    saveSecrets: async (p) => void Object.assign(secrets, p),
    env: (n) => env[n],
    fetch: () => Promise.reject(new Error("no network in tests")),
    ...over,
  };
}

// Published HMAC-SHA256 test vector.
const VECTOR = { key: "key", body: "The quick brown fox jumps over the lazy dog", hex: "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8" };

Deno.test("HMAC matches the published test vector", async () => {
  assertEquals(toHex(await hmacSha256(VECTOR.key, VECTOR.body)), VECTOR.hex);
});

Deno.test("QuickBooks invoice: lines, tax codes, discount line and numbering", () => {
  const settings = ctx().connection.settings;
  const body = qboInvoice(invoice({ discount: { type: "percent", value: 10, amount: 40, reason: "Loyalty" } }), "55", settings) as any;
  assertEquals(body.CustomerRef, { value: "55" });
  assertEquals(body.Line.length, 3);
  assertEquals(body.Line[0].SalesItemLineDetail, { ItemRef: { value: "7" }, Qty: 1, UnitPrice: 350, TaxCodeRef: { value: "20" } });
  assertEquals(body.Line[2], { DetailType: "DiscountLineDetail", Amount: 40, Description: "Loyalty", DiscountLineDetail: { PercentBased: true, DiscountPercent: 10 } });
  assertEquals(body.DueDate, "2026-10-28");
  assert(!("DocNumber" in body), "QuickBooks numbers it by default");
  assertEquals(body.GlobalTaxCalculation, "TaxExcluded");
  const own = qboInvoice(invoice({ tax_rate: 0 }), "55", { ...settings, numbering: "shoplane" }) as any;
  assertEquals(own.DocNumber, "INV-20260928-AB12");
  assertEquals(own.Line[0].SalesItemLineDetail.TaxCodeRef, { value: "ZR" });
});

Deno.test("QuickBooks invoice needs a product to post to", () => {
  let threw = false;
  try {
    qboInvoice(invoice(), "55", {});
  } catch (e) {
    threw = /product or service/.test((e as Error).message);
  }
  assert(threw);
});

Deno.test("Xero invoice: percent discount per line, fixed discount as a line, authorised", () => {
  const settings = ctx().connection.settings;
  const pct = xeroInvoice(invoice({ discount: { type: "percent", value: 10, amount: 40, reason: null } }), "c-1", settings) as any;
  assertEquals(pct.Type, "ACCREC");
  assertEquals(pct.Status, "AUTHORISED");
  assertEquals(pct.LineAmountTypes, "Exclusive");
  assertEquals(pct.LineItems[0], { Description: "Rewind stator", Quantity: 1, UnitAmount: 350, AccountCode: "200", TaxType: "20", DiscountRate: 10 });
  assertEquals(pct.Reference, "EDL-202609-004 · INV-20260928-AB12");
  const fixed = xeroInvoice(invoice({ discount: { type: "amount", value: 25, amount: 25, reason: "Goodwill" } }), "c-1", settings, "x-9") as any;
  assertEquals(fixed.InvoiceID, "x-9");
  assertEquals(fixed.LineItems.at(-1).UnitAmount, -25);
  assertEquals(fixed.LineItems.at(-1).Description, "Goodwill");
});

Deno.test("Xero dates and webhook events", () => {
  assertEquals(xeroDate("/Date(1790467200000+0000)/"), new Date(1790467200000).toISOString());
  assertEquals(xeroDate(null), null);
  assertEquals(xero.parseWebhook(JSON.stringify({ events: [], firstEventSequence: 0 })), []);
  assertEquals(xero.parseWebhook(JSON.stringify({ events: [{ resourceId: "abc", eventCategory: "INVOICE", eventType: "UPDATE" }, { resourceId: "c", eventCategory: "CONTACT" }] })), [{ kind: "invoice", external_id: "abc" }]);
});

Deno.test("QuickBooks webhook events", () => {
  const body = { eventNotifications: [{ realmId: "123", dataChangeEvent: { entities: [{ name: "Payment", id: "88", operation: "Create" }, { name: "Invoice", id: "41", operation: "Update" }, { name: "Customer", id: "3" }] } }] };
  assertEquals(quickbooks.parseWebhook(JSON.stringify(body)), [{ kind: "payment", external_id: "88" }, { kind: "invoice", external_id: "41" }]);
});

Deno.test("Webhook signatures: right key passes, wrong key or missing header fails", async () => {
  const b64 = toBase64(await hmacSha256(VECTOR.key, VECTOR.body));
  const qboOk = await quickbooks.verifyWebhook(ctx({}, { QUICKBOOKS_WEBHOOK_VERIFIER: "key" }), new Headers({ "intuit-signature": b64 }), VECTOR.body);
  const qboBad = await quickbooks.verifyWebhook(ctx({}, { QUICKBOOKS_WEBHOOK_VERIFIER: "other" }), new Headers({ "intuit-signature": b64 }), VECTOR.body);
  const xeroOk = await xero.verifyWebhook(ctx({}, { XERO_WEBHOOK_KEY: "key" }), new Headers({ "x-xero-signature": b64 }), VECTOR.body);
  const xeroMissing = await xero.verifyWebhook(ctx({}, { XERO_WEBHOOK_KEY: "key" }), new Headers(), VECTOR.body);
  assert(qboOk && xeroOk);
  assert(!qboBad && !xeroMissing);
  const c = ctx();
  const sig = await signature(c.secrets.webhook_secret!, VECTOR.body);
  assert(await webhook.verifyWebhook(c, new Headers({ "x-shoplane-signature": sig }), VECTOR.body));
  assert(!(await webhook.verifyWebhook(c, new Headers({ "x-shoplane-signature": "sha256=00" }), VECTOR.body)));
});

Deno.test("Webhook connector reads paid notices", () => {
  assertEquals(webhook.parseWebhook(JSON.stringify({ event: "invoice.paid", invoice_id: "inv-1", paid_at: "2026-09-28T10:00:00Z" })), [{ kind: "invoice", paid: true, paid_at: "2026-09-28T10:00:00Z", local_invoice_id: "inv-1" }]);
  assertEquals(webhook.parseWebhook(JSON.stringify({ event: "invoice.viewed", invoice_id: "inv-1" })), []);
});

Deno.test("Webhook connector posts signed events and uses the reply's reference", async () => {
  const seen: { url: string; headers: Headers; body: string }[] = [];
  const c = ctx({
    connection: { provider: "webhook", status: "connected", active: true, org_id: "webhook", org_name: null, settings: { url: "https://books.example.com/hook" } },
    fetch: async (url, init) => {
      seen.push({ url: String(url), headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response(JSON.stringify({ id: "SAGE-77", number: "S1001" }), { status: 200 });
    },
  });
  const ref = await webhook.upsertInvoice(c, invoice(), { id: "cust-1" }, null);
  assertEquals(ref, { id: "SAGE-77", number: "S1001", url: null });
  assertEquals(seen[0].url, "https://books.example.com/hook");
  assertEquals(seen[0].headers.get("x-shoplane-event"), "invoice.upserted");
  assertEquals(seen[0].headers.get("x-shoplane-signature"), await signature("whsec", seen[0].body));
});

Deno.test("QuickBooks refreshes an expired token, saves it, then creates the invoice", async () => {
  const calls: string[] = [];
  const c = ctx(
    {
      fetch: async (url, init) => {
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (String(url).includes("tokens/bearer")) {
          assertEquals(new URLSearchParams(String(init?.body)).get("grant_type"), "refresh_token");
          return new Response(JSON.stringify({ access_token: "new-tok", refresh_token: "new-ref", expires_in: 3600 }), { status: 200 });
        }
        assertEquals(new Headers(init?.headers).get("authorization"), "Bearer new-tok");
        return new Response(JSON.stringify({ Invoice: { Id: "41", DocNumber: "1043" } }), { status: 200 });
      },
    },
    { QUICKBOOKS_CLIENT_ID: "id", QUICKBOOKS_CLIENT_SECRET: "secret" },
  );
  c.secrets.token_expires_at = new Date(Date.now() - 1000).toISOString();
  const ref = await quickbooks.upsertInvoice(c, invoice(), { id: "55" }, null);
  assertEquals(ref.id, "41");
  assertEquals(ref.number, "1043");
  assertEquals(c.secrets.refresh_token, "new-ref");
  assert(calls[1].startsWith("POST https://sandbox-quickbooks.api.intuit.com/v3/company/123/invoice?minorversion="));
});

Deno.test("QuickBooks errors are readable and rate limits retry", async () => {
  const c = ctx({ fetch: async () => new Response(JSON.stringify({ Fault: { Error: [{ Detail: "Duplicate Document Number Error" }] } }), { status: 400 }) });
  const err = await assertRejects(() => quickbooks.upsertInvoice(c, invoice(), { id: "55" }, null));
  assert(/Duplicate Document Number/.test((err as Error).message));
  const limited = ctx({ fetch: async () => new Response("slow down", { status: 429 }) });
  const e2 = (await assertRejects(() => quickbooks.upsertInvoice(limited, invoice(), { id: "55" }, null))) as { retryable?: boolean };
  assert(e2.retryable);
});

Deno.test("Test connector keeps its own books and can be paid", async () => {
  const c = ctx({ connection: { provider: "test", status: "connected", active: true, org_id: "test", org_name: null, settings: {} } });
  const cust = await testProvider.upsertCustomer(c, { id: "u1", name: "Jo", company: "Acme Ltd", email: "jo@acme.test", phone: null, address: null }, null);
  const inv = await testProvider.upsertInvoice(c, invoice(), cust, null);
  assertEquals(inv.number, "1001");
  assertEquals((await testProvider.getInvoiceStatus(c, inv)).paid, false);
  await simulatePayment(c, inv.id);
  assertEquals((await testProvider.getInvoiceStatus(c, inv)).paid, true);
});
