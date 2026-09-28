// The contract every finance system implements. Shoplane only ever talks to
// this interface; adding Sage, FreeAgent or anything else means writing one
// file that implements it and registering it in registry.ts.
//
// See docs/integrations.md for the full guide.

export type ProviderId = "quickbooks" | "xero" | "webhook" | "test";

/** The connection row, minus secrets. */
export interface Connection {
  provider: ProviderId;
  status: "disconnected" | "connected" | "error";
  active: boolean;
  org_id: string | null;
  org_name: string | null;
  settings: ConnectionSettings;
}

/** Choices made when connecting. Every field is optional; adapters fall back to sensible defaults. */
export interface ConnectionSettings {
  /** Tax code for taxed lines, and for untaxed (0%) lines. */
  tax_code?: string;
  tax_code_zero?: string;
  /** QuickBooks: the product/service lines post to. */
  item_id?: string;
  /** Xero: the revenue account code lines post to; the bank account payments go to. */
  account_code?: string;
  payment_account_code?: string;
  /** Who gives the invoice its number, and who emails it to the client. */
  numbering?: "provider" | "shoplane";
  send_from?: "provider" | "shoplane";
  /** Only invoices created on or after this date sync (YYYY-MM-DD). */
  sync_from?: string;
  /** Webhook connector: where events are posted. */
  url?: string;
}

export interface Secrets {
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  webhook_secret: string | null;
  extra: Record<string, unknown>;
}

/** What an adapter needs to do its work. */
export interface ProviderContext {
  connection: Connection;
  secrets: Secrets;
  /** Persist refreshed tokens or adapter state. */
  saveSecrets(patch: Partial<Secrets>): Promise<void>;
  env(name: string): string | undefined;
  fetch: typeof fetch;
}

export interface CustomerInput {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface InvoiceInput {
  id: string;
  number: string;
  /** Shoplane's project reference, used as the invoice reference. */
  reference: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  lines: InvoiceLineInput[];
  subtotal: number;
  discount: { type: "percent" | "amount"; value: number; amount: number; reason: string | null } | null;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
}

export interface ExternalRef {
  id: string;
  number?: string | null;
  url?: string | null;
}

export interface RemoteInvoiceStatus {
  paid: boolean;
  paid_at: string | null;
  amount_due: number;
  voided: boolean;
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

/** Something the other system told us about. */
export interface WebhookEvent {
  kind: "invoice" | "payment";
  /** The other system's id for the invoice or payment. */
  external_id?: string;
  /** Set when the sender names Shoplane's own invoice (the webhook connector does). */
  local_invoice_id?: string;
  /** When the sender says the invoice is paid, and when. */
  paid?: boolean;
  paid_at?: string | null;
}

export interface OAuthResult {
  secrets: Partial<Secrets>;
  org_id: string;
  org_name: string | null;
}

export interface AccountingProvider {
  id: ProviderId;
  label: string;
  /** Server secrets that must be set before connecting (names only). */
  requiredEnv: string[];
  /** oauth2: the user signs in to the other system; secret: we generate a signing secret; none: nothing to set up. */
  auth: "oauth2" | "secret" | "none";
  /** Whether the connected system can email invoices itself. */
  canSend: boolean;
  /** Whether Shoplane can ask it for an invoice's payment status (the fallback when webhooks are missed). */
  canPoll: boolean;

  authorizeUrl?(ctx: Pick<ProviderContext, "env">, state: string, redirectUri: string): string;
  exchangeCode?(ctx: Pick<ProviderContext, "env" | "fetch">, params: URLSearchParams, redirectUri: string): Promise<OAuthResult>;

  /** Confirms the connection works; returns the organisation's name. */
  testConnection(ctx: ProviderContext): Promise<{ org_name: string | null }>;
  /** Lists to pick mapping settings from (empty lists when not applicable). */
  listOptions(ctx: ProviderContext): Promise<ProviderOptions>;

  upsertCustomer(ctx: ProviderContext, customer: CustomerInput, existing: ExternalRef | null): Promise<ExternalRef>;
  upsertInvoice(ctx: ProviderContext, invoice: InvoiceInput, customer: ExternalRef, existing: ExternalRef | null): Promise<ExternalRef>;
  sendInvoice?(ctx: ProviderContext, invoice: ExternalRef, email: string | null): Promise<void>;
  voidInvoice(ctx: ProviderContext, invoice: ExternalRef): Promise<void>;
  recordPayment(ctx: ProviderContext, invoice: ExternalRef, amount: number, paidAt: string, currency: string): Promise<ExternalRef>;
  getInvoiceStatus(ctx: ProviderContext, invoice: ExternalRef): Promise<RemoteInvoiceStatus>;
  /** For a payment the other system told us about: which invoices it paid. */
  getPaymentInvoices?(ctx: ProviderContext, paymentId: string): Promise<string[]>;

  /** Checks the webhook's signature; false means reject it. */
  verifyWebhook(ctx: Pick<ProviderContext, "env" | "secrets">, headers: Headers, rawBody: string): Promise<boolean>;
  parseWebhook(rawBody: string): WebhookEvent[];
}

/** An error the user can act on (bad mapping, missing permission in the other system). */
export class ProviderError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}
