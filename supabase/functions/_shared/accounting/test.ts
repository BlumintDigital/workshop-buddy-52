// A pretend accounting system for trying the integration end to end without a
// real account: it numbers invoices, "emails" them and can be told an invoice
// was paid (Settings → Integrations → Simulate a payment). Its records live in
// the connection's secrets row. Never use it for real bookkeeping.

import type { AccountingProvider, ProviderContext } from "./types.ts";
import { displayName, ProviderError } from "./util.ts";

type Book = {
  next: number;
  customers: Record<string, { name: string; email: string | null }>;
  invoices: Record<string, { number: string; customer: string; total: number; paid: boolean; paid_at: string | null; voided: boolean; sent_to: string | null }>;
  payments: Record<string, { invoice: string; amount: number }>;
};

function book(ctx: ProviderContext): Book {
  const b = (ctx.secrets.extra?.book ?? {}) as Partial<Book>;
  return { next: b.next ?? 1001, customers: b.customers ?? {}, invoices: b.invoices ?? {}, payments: b.payments ?? {} };
}
async function save(ctx: ProviderContext, b: Book) {
  const extra = { ...ctx.secrets.extra, book: b };
  ctx.secrets.extra = extra;
  await ctx.saveSecrets({ extra });
}

/** Marks a test invoice paid, as if the client paid it in the other system. */
export async function simulatePayment(ctx: ProviderContext, externalId: string) {
  const b = book(ctx);
  const inv = b.invoices[externalId];
  if (!inv) throw new ProviderError("That invoice isn't in the test books yet. Sync it first.");
  inv.paid = true;
  inv.paid_at = new Date().toISOString();
  await save(ctx, b);
}

export const test: AccountingProvider = {
  id: "test",
  label: "Test connection",
  requiredEnv: [],
  auth: "none",
  canSend: true,
  canPoll: true,

  async testConnection() {
    return { org_name: "Shoplane test books" };
  },

  async listOptions() {
    return {
      tax_codes: [{ value: "STD", label: "Standard (20%)" }, { value: "ZERO", label: "Zero rated (0%)" }],
      items: [{ value: "REPAIRS", label: "Repairs and servicing" }],
      accounts: [{ value: "200", label: "200 · Sales" }],
      payment_accounts: [{ value: "090", label: "090 · Business bank account" }],
    };
  },

  async upsertCustomer(ctx, c, existing) {
    const b = book(ctx);
    const id = existing?.id ?? `CUS-${Object.keys(b.customers).length + 1}`;
    b.customers[id] = { name: displayName(c), email: c.email };
    await save(ctx, b);
    return { id };
  },

  async upsertInvoice(ctx, inv, customer, existing) {
    const b = book(ctx);
    const id = existing?.id ?? `INV-${b.next}`;
    const number = ctx.connection.settings.numbering === "shoplane" ? inv.number : existing ? b.invoices[id]?.number ?? String(b.next) : String(b.next++);
    const prev = b.invoices[id];
    b.invoices[id] = { number, customer: customer.id, total: inv.total, paid: prev?.paid ?? false, paid_at: prev?.paid_at ?? null, voided: false, sent_to: prev?.sent_to ?? null };
    await save(ctx, b);
    return { id, number, url: null };
  },

  async sendInvoice(ctx, invoice, email) {
    const b = book(ctx);
    if (b.invoices[invoice.id]) b.invoices[invoice.id].sent_to = email;
    await save(ctx, b);
  },

  async voidInvoice(ctx, invoice) {
    const b = book(ctx);
    if (b.invoices[invoice.id]) b.invoices[invoice.id].voided = true;
    await save(ctx, b);
  },

  async recordPayment(ctx, invoice, amount) {
    const b = book(ctx);
    const inv = b.invoices[invoice.id];
    if (!inv) throw new ProviderError("That invoice isn't in the test books.");
    inv.paid = true;
    inv.paid_at = new Date().toISOString();
    const id = `PAY-${Object.keys(b.payments).length + 1}`;
    b.payments[id] = { invoice: invoice.id, amount };
    await save(ctx, b);
    return { id };
  },

  async getInvoiceStatus(ctx, invoice) {
    const inv = book(ctx).invoices[invoice.id];
    return { paid: !!inv?.paid, paid_at: inv?.paid_at ?? null, amount_due: inv?.paid ? 0 : inv?.total ?? 0, voided: !!inv?.voided };
  },

  async getPaymentInvoices(ctx, paymentId) {
    const p = book(ctx).payments[paymentId];
    return p ? [p.invoice] : [];
  },

  async verifyWebhook() {
    return false;
  },

  parseWebhook() {
    return [];
  },
};
