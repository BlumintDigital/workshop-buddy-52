# Accounting integrations

Shoplane drafts invoices; a connected accounting system keeps the books. When a
system is connected, every invoice Shoplane sends goes there, and payments
recorded there come back and mark the invoice paid. Only one system is
connected at a time. With none connected, nothing leaves Shoplane.

Connect and manage it in **Settings → Integrations** (admins).

| System | How it connects | Numbers and emails invoices | Payments come back |
| --- | --- | --- | --- |
| QuickBooks Online | Sign in to QuickBooks | Yes, if you choose | Webhook, plus a check on every sync |
| Xero | Sign in to Xero | Yes, if you choose | Webhook, plus a check on every sync |
| Other system (webhook) | Signed JSON to a URL you give | The receiving system decides | The receiving system posts a signed notice |
| Test connection | Nothing to set up | Pretends to | "Simulate a payment" on the invoice |

## What syncs, and when

| In Shoplane | In the connected system |
| --- | --- |
| An invoice is sent to the client | The customer is found or created, then the invoice is created |
| A sent invoice's lines, total, due date, discount or notes change | The invoice is updated |
| An invoice is marked paid in Shoplane | A payment is recorded against it |
| An invoice is cancelled | The invoice is voided |
| A payment is recorded there | The Shoplane invoice is marked paid |

Drafts never sync. Changes are queued and pushed straight away; failures retry
with growing gaps (2, 4, 8, 16 minutes) and show in the sync log with a Retry
button. Missed webhooks are covered by checking unpaid invoices on each sync.

---

## Connecting QuickBooks Online

1. Sign in at [developer.intuit.com](https://developer.intuit.com) and create an
   app with the **Accounting** scope.
2. Under **Keys & credentials**, add the **Redirect URI** shown in
   Settings → Integrations (it ends in `/functions/v1/accounting-callback`).
3. In Supabase → Edge Functions → Secrets, set:
   - `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`
   - `QUICKBOOKS_ENVIRONMENT` = `sandbox` to test with a QuickBooks sandbox
     company, or `production` for your real books
4. Optional, for instant payment updates: under **Webhooks**, add the webhook
   address from Settings (`…/accounting-webhook?provider=quickbooks`), tick
   **Payment** and **Invoice**, and set `QUICKBOOKS_WEBHOOK_VERIFIER` to the
   verifier token Intuit shows.
5. In Settings → Integrations, **Sign in to QuickBooks Online**, then choose the
   product or service invoices post to, the tax codes, and the deposit account.

Start with a sandbox company. Switch `QUICKBOOKS_ENVIRONMENT` to `production`
and reconnect when you're happy; reconnecting to a different company clears
the old links so nothing points at the wrong records.

## Connecting Xero

1. At [developer.xero.com](https://developer.xero.com/app/manage), create a
   **Web app** and add the **Redirect URI** from Settings → Integrations.
2. Set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` in Supabase → Edge Functions →
   Secrets. If your app uses Xero's newer granular scopes, set `XERO_SCOPES`
   to the list Xero gives you.
3. Optional, for instant payment updates: add a webhook for **Invoices** with
   the address from Settings (`…/accounting-webhook?provider=xero`) and set
   `XERO_WEBHOOK_KEY` to its signing key. Xero checks the address when you save
   it; Shoplane answers that check automatically.
4. **Sign in to Xero**, then choose the revenue account, tax rates and the bank
   account payments go to.

---

## Connecting any other system (webhook API)

For Sage, FreeAgent, Zoho Books, a Zapier or Make scenario, or your own code.
Give Shoplane an `https://` address in Settings → Integrations. Shoplane shows a
**signing secret**; the receiver uses it to check every request came from
Shoplane, and to sign its own notices back.

### Events Shoplane sends

`POST` to your address with `Content-Type: application/json` and these headers:

| Header | Value |
| --- | --- |
| `X-Shoplane-Event` | `customer.upserted`, `invoice.upserted`, `invoice.voided`, `payment.recorded` or `connection.test` |
| `X-Shoplane-Delivery` | A unique id for this delivery |
| `X-Shoplane-Signature` | `sha256=` + hex HMAC-SHA256 of the raw body, keyed with the signing secret |

Body:

```json
{
  "event": "invoice.upserted",
  "sent_at": "2026-09-28T10:15:00Z",
  "data": {
    "id": "1b7c…",
    "number": "INV-20260928-AB12",
    "reference": "EDL-202609-004",
    "issue_date": "2026-09-28",
    "due_date": "2026-10-28",
    "currency": "GBP",
    "lines": [{ "description": "Rewind stator", "quantity": 1, "unit_price": 350, "amount": 350 }],
    "subtotal": 350,
    "discount": { "type": "percent", "value": 10, "amount": 35, "reason": "Loyalty" },
    "tax_rate": 20,
    "tax_amount": 63,
    "total": 378,
    "notes": null,
    "customer_external_id": "your-customer-id",
    "external_id": null
  }
}
```

- `customer.upserted` sends `{ id, name, company, email, phone, address, external_id }`.
- `invoice.voided` sends `{ external_id }`.
- `payment.recorded` sends `{ invoice_external_id, amount, currency, paid_at }`.
- `external_id` is `null` the first time and your id after that.

Reply with any `2xx`. To give Shoplane your reference, reply with JSON:

```json
{ "id": "SAGE-1043", "number": "1043", "url": "https://books.example.com/invoices/1043" }
```

Shoplane shows the number and link on the invoice and sends your `id` back as
`external_id` next time. Any other status is retried; `4xx` other than `429`
stops after the first failure and shows in the sync log.

Check a signature like this (Node):

```js
const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-shoplane-signature"]));
```

### Telling Shoplane an invoice was paid

`POST https://<project>.supabase.co/functions/v1/accounting-webhook?provider=webhook`
with the same `X-Shoplane-Signature` header, signed with the same secret:

```json
{ "event": "invoice.paid", "invoice_id": "<Shoplane invoice id>", "paid_at": "2026-09-30T09:00:00Z" }
```

Use `"external_id": "<your id>"` instead of `invoice_id` if that's what you
have. A bad signature gets `401` and changes nothing.

---

## Adding another native system (for developers)

The code lives in `supabase/functions/_shared/accounting/`.

| File | What it is |
| --- | --- |
| `types.ts` | `AccountingProvider`, the interface every system implements |
| `registry.ts` | The list of systems |
| `engine.ts` | The provider-neutral sync engine: queue, retries, payments, reconciling |
| `quickbooks.ts`, `xero.ts` | Native adapters |
| `webhook.ts` | The generic signed-JSON connector |
| `test.ts` | The pretend system used by the tests |
| `adapters.test.ts` | Unit tests: request bodies, signatures, token refresh |

To add a system:

1. Create `yoursystem.ts` implementing `AccountingProvider`: sign-in
   (`authorizeUrl`, `exchangeCode` for OAuth 2), `upsertCustomer`,
   `upsertInvoice`, `voidInvoice`, `recordPayment`, `getInvoiceStatus`,
   `listOptions` for the mapping lists, and `verifyWebhook`/`parseWebhook` for
   notices. `oauth.ts` handles token exchange and refresh for you.
2. Register it in `registry.ts`.
3. In a migration, add its id to the `accounting_connections.provider` check and
   insert its row.
4. Add its blurb to `PROVIDER_BLURB` in `src/lib/accounting.ts`.
5. Add tests to `adapters.test.ts` and run `npm run test:accounting`.

Nothing else changes: the queue, triggers, retries, Settings screen and invoice
status line work for every system.

The edge functions are `accounting` (connect, settings, options, sync),
`accounting-callback` (OAuth return) and `accounting-webhook` (signed notices).
Credentials are stored in `accounting_secrets`, which only the edge functions
can read.
