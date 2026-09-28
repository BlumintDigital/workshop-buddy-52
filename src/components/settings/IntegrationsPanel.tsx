import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, Plug, RefreshCw, RotateCcw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { copyText } from "@/lib/clipboard";
import { formatDate } from "@/lib/format";
import { relativeTime } from "@/lib/profileNames";
import {
  accountingCall,
  PROVIDER_BLURB,
  type AccountingStatus,
  type Option,
  type ProviderId,
  type ProviderInfo,
  type ProviderOptions,
  type SyncJob,
} from "@/lib/accounting";

const JOB_TONE: Record<SyncJob["status"], StatusTone> = { queued: "info", running: "info", done: "success", failed: "danger" };
const JOB_LABEL: Record<SyncJob["status"], string> = { queued: "Waiting", running: "Running", done: "Done", failed: "Failed" };

function describeJob(job: SyncJob, numbers: Record<string, string>): string {
  const inv = job.local_id ? numbers[job.local_id] ?? "an invoice" : null;
  if (job.entity_type === "invoice") {
    if (job.action === "upsert") return `Send ${inv}`;
    if (job.action === "void") return `Void ${inv}`;
    if (job.action === "payment") return `Record payment on ${inv}`;
  }
  if (job.entity_type === "remote_payment") return `Check payment ${job.external_id}`;
  if (job.entity_type === "remote_invoice") return `Check invoice ${job.external_id}`;
  return `${job.entity_type} ${job.action}`;
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="h-9 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function OptionSelect({ id, label, value, options, onChange, hint, allowNone = true }: { id: string; label: string; value?: string; options: Option[]; onChange: (v: string) => void; hint?: string; allowNone?: boolean }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="__none__">Not set</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Settings for the connected system: mapping, numbering, sending. */
function ConnectedSettings({ provider, onSaved }: { provider: ProviderInfo; onSaved: () => void }) {
  const conn = provider.connection!;
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(conn.settings ?? {}).map(([k, v]) => [k, v ?? ""])));
  const [options, setOptions] = useState<ProviderOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const needsLists = provider.id === "quickbooks" || provider.id === "xero" || provider.id === "test";

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      setOptions(await accountingCall<ProviderOptions>({ action: "options", provider: provider.id }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingOptions(false);
    }
  }, [provider.id]);
  useEffect(() => {
    if (needsLists) void loadOptions();
  }, [needsLists, loadOptions]);

  const save = async () => {
    setSaving(true);
    try {
      await accountingCall({ action: "settings", provider: provider.id, settings: form });
      toast.success("Accounting settings saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const o = options ?? { tax_codes: [], items: [], accounts: [], payment_accounts: [] };
  return (
    <div className="space-y-4">
      {needsLists && (
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Where invoices go</h4>
          <Button variant="ghost" size="sm" onClick={() => void loadOptions()} disabled={loadingOptions}>
            {loadingOptions ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Reload lists
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(provider.id === "quickbooks" || provider.id === "test") && (
          <OptionSelect id="acc-item" label="Product or service" value={form.item_id} options={o.items} onChange={(v) => set("item_id", v)} hint="Every invoice line posts to this QuickBooks product." />
        )}
        {(provider.id === "xero" || provider.id === "test") && (
          <OptionSelect id="acc-account" label="Revenue account" value={form.account_code} options={o.accounts} onChange={(v) => set("account_code", v)} hint="Every invoice line posts to this account." />
        )}
        {needsLists && (
          <>
            <OptionSelect id="acc-tax" label="Tax code" value={form.tax_code} options={o.tax_codes} onChange={(v) => set("tax_code", v)} hint="For invoices with tax." />
            <OptionSelect id="acc-tax-zero" label="Tax code for untaxed invoices" value={form.tax_code_zero} options={o.tax_codes} onChange={(v) => set("tax_code_zero", v)} hint="For invoices at 0%." />
            <OptionSelect id="acc-payment" label="Payments go into" value={form.payment_account_code} options={o.payment_accounts} onChange={(v) => set("payment_account_code", v)} hint="When a payment is marked in Shoplane." />
          </>
        )}
        <OptionSelect
          id="acc-numbering"
          label="Invoice numbers"
          value={form.numbering || "provider"}
          allowNone={false}
          options={[{ value: "provider", label: `${provider.label} numbers them` }, { value: "shoplane", label: "Keep Shoplane's numbers" }]}
          onChange={(v) => set("numbering", v)}
        />
        {provider.can_send && (
          <OptionSelect
            id="acc-send"
            label="Who emails the invoice"
            value={form.send_from || "shoplane"}
            allowNone={false}
            options={[{ value: "shoplane", label: "Shoplane" }, { value: "provider", label: provider.label }]}
            onChange={(v) => set("send_from", v)}
            hint={form.send_from === "provider" ? `Shoplane won't email the client; ${provider.label} will.` : undefined}
          />
        )}
        <div className="space-y-1">
          <Label htmlFor="acc-sync-from">Sync invoices created from</Label>
          <DatePickerInput id="acc-sync-from" value={form.sync_from ?? ""} onChange={(v) => set("sync_from", v)} />
          <p className="text-xs text-muted-foreground">Leave empty to sync every invoice you send from now on.</p>
        </div>
      </div>
      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}

/**
 * Settings → Integrations: connect one accounting system, map how invoices
 * land there, and watch the sync. Only admins see this tab.
 */
export default function IntegrationsPanel() {
  const [status, setStatus] = useState<AccountingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await accountingCall<AccountingStatus>({ action: "status" });
      setStatus(s);
      setLoadError(null);
      const ids = [...new Set(s.log.map((j) => j.local_id).filter((v): v is string => !!v))];
      if (ids.length) {
        const { data } = await supabase.from("invoices").select("id, invoice_number").in("id", ids);
        setNumbers(Object.fromEntries((data ?? []).map((i) => [i.id, i.invoice_number])));
      }
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    // Coming back from QuickBooks or Xero sign-in.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) toast.success("Connected. Choose where invoices go below.");
    if (error) toast.error(`Couldn't connect: ${error}`, { duration: 12000 });
    if (connected || error) {
      params.delete("connected");
      params.delete("error");
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    }
  }, [load]);

  const active = useMemo(() => status?.providers.find((p) => p.connection?.active && p.connection.status === "connected") ?? null, [status]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message, { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const connect = (p: ProviderInfo) =>
    run(`connect-${p.id}`, async () => {
      const res = await accountingCall<{ authorize_url?: string; webhook_secret?: string | null }>({ action: "connect", provider: p.id, app_url: window.location.origin, url: webhookUrl });
      if (res.authorize_url) {
        window.location.href = res.authorize_url;
        return;
      }
      if (res.webhook_secret) setSecret(res.webhook_secret);
      toast.success(`${p.label} connected`);
      await load();
    });

  if (!status && loadError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive-soft p-4 text-sm">
        <p>Couldn't load the accounting connection: {loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          Try again
        </Button>
      </div>
    );
  }
  if (!status) return <Skeleton className="h-64 w-full rounded-lg" />;

  const others = status.providers.filter((p) => p.id !== active?.id);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Connect your accounting system. Shoplane drafts invoices and sends them there; the other system can number and email them, and payments recorded there mark the invoice paid here. One system is connected at a time.
      </p>

      {active ? (
        <section aria-label="Connected system" className="space-y-4 rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">{active.label}</h3>
                <StatusPill tone="success">Connected</StatusPill>
              </div>
              <p className="text-sm text-muted-foreground">
                {active.connection?.org_name ?? "Connected"}
                {active.connection?.connected_at && ` · since ${formatDate(active.connection.connected_at)}`}
                {active.connection?.last_sync_at && ` · last sync ${relativeTime(active.connection.last_sync_at)}`}
              </p>
              {active.connection?.last_error && <p className="text-sm text-destructive">Last problem: {active.connection.last_error}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("test", async () => {
                const r = await accountingCall<{ org_name: string | null }>({ action: "test", provider: active.id });
                toast.success(`Connection works${r.org_name ? `: ${r.org_name}` : ""}`);
                await load();
              })}>
                <Link2 className="mr-1.5 h-4 w-4" aria-hidden />Test connection
              </Button>
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("sync", async () => {
                const r = await accountingCall<{ done: number; failed: number; retrying: number; reconciled: number }>({ action: "sync" });
                toast.success(`Synced: ${r.done} done${r.failed ? `, ${r.failed} failed` : ""}${r.retrying ? `, ${r.retrying} will retry` : ""}${r.reconciled ? `, ${r.reconciled} marked paid` : ""}`);
                await load();
              })}>
                {busy === "sync" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />}Sync now
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={!!busy} onClick={() => run("disconnect", async () => {
                await accountingCall({ action: "disconnect", provider: active.id });
                toast.success(`${active.label} disconnected`);
                setSecret(null);
                await load();
              })}>
                <Unplug className="mr-1.5 h-4 w-4" aria-hidden />Disconnect
              </Button>
            </div>
          </div>

          {active.id === "webhook" && (
            <div className="grid gap-3 rounded-md bg-muted/60 p-4 sm:grid-cols-2">
              <CopyField id="acc-out-url" label="Shoplane posts events to" value={active.connection?.settings.url ?? ""} />
              <CopyField id="acc-in-url" label="Send paid notices to" value={`${status.webhook_url}?provider=webhook`} />
              {secret ? (
                <div className="sm:col-span-2"><CopyField id="acc-secret" label="Signing secret" value={secret} /></div>
              ) : (
                <Button variant="outline" size="sm" className="w-fit" onClick={() => run("secret", async () => setSecret((await accountingCall<{ webhook_secret: string }>({ action: "reveal-secret", provider: "webhook" })).webhook_secret))}>
                  Show signing secret
                </Button>
              )}
            </div>
          )}
          {(active.id === "quickbooks" || active.id === "xero") && (
            <div className="space-y-2 rounded-md bg-muted/60 p-4">
              <p className="text-sm">
                {active.webhook_ready
                  ? "Payments made in the other system reach Shoplane straight away."
                  : `Payments are checked every sync. For instant updates, add the webhook below in the ${active.label} developer portal and set ${active.id === "quickbooks" ? "QUICKBOOKS_WEBHOOK_VERIFIER" : "XERO_WEBHOOK_KEY"} on the server.`}
              </p>
              <CopyField id="acc-hook" label="Webhook address" value={`${status.webhook_url}?provider=${active.id}`} />
            </div>
          )}

          <ConnectedSettings key={active.id} provider={active} onSaved={() => void load()} />
        </section>
      ) : (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">No accounting system is connected, so invoices stay in Shoplane only.</p>
      )}

      <section aria-label="Accounting systems" className="space-y-3">
        <h3 className="text-base font-semibold">{active ? "Switch to another system" : "Connect a system"}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {others.map((p) => (
            <article key={p.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <div className="space-y-1">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Plug className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {p.label}
                </h4>
                <p className="text-sm text-muted-foreground">{PROVIDER_BLURB[p.id as ProviderId]}</p>
              </div>
              {p.missing_env.length > 0 ? (
                <div className="space-y-2 rounded-md bg-warning-soft p-3 text-sm text-foreground">
                  <p>
                    Before connecting, create an app in the{" "}
                    <a className="font-medium underline underline-offset-2" href={p.id === "quickbooks" ? "https://developer.intuit.com" : "https://developer.xero.com/app/manage"} target="_blank" rel="noopener noreferrer">
                      {p.id === "quickbooks" ? "Intuit" : "Xero"} developer portal <ExternalLink className="inline h-3 w-3" aria-hidden />
                    </a>
                    , add the address below as its redirect URI, then set <span className="font-mono text-xs">{p.missing_env.join(", ")}</span> in Supabase → Edge Functions → Secrets.
                  </p>
                  <CopyField id={`acc-redirect-${p.id}`} label="Redirect URI" value={status.redirect_uri} />
                </div>
              ) : null}
              {p.id === "webhook" && (
                <div className="space-y-1">
                  <Label htmlFor="acc-webhook-url">Post events to</Label>
                  <Input id="acc-webhook-url" placeholder="https://" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
                </div>
              )}
              <Button className="mt-auto w-fit" variant={p.id === "test" ? "outline" : "default"} disabled={!!busy || p.missing_env.length > 0 || (p.id === "webhook" && !webhookUrl)} onClick={() => void connect(p)}>
                {busy === `connect-${p.id}` && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {p.auth === "oauth2" ? `Sign in to ${p.label}` : `Connect ${p.label.toLowerCase()}`}
              </Button>
              {active && <p className="text-xs text-muted-foreground">Connecting this disconnects {active.label} from syncing.</p>}
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Sync log" className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h3 className="text-base font-semibold">Sync log</h3>
          <span className="text-xs text-muted-foreground">
            {status.queue.pending} waiting · {status.queue.failed} failed
          </span>
        </div>
        {status.log.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing synced yet. Sending an invoice queues it here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Sync log">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">When</th>
                  <th scope="col" className="px-3 py-2 font-medium">What</th>
                  <th scope="col" className="px-3 py-2 font-medium">Result</th>
                  <th scope="col" className="px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {status.log.map((j) => (
                  <tr key={j.id} className="border-b last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{relativeTime(j.finished_at ?? j.created_at)}</td>
                    <td className="px-3 py-2">
                      {describeJob(j, numbers)}
                      {j.result && typeof j.result.number === "string" && <span className="text-muted-foreground"> · #{j.result.number}</span>}
                      {j.last_error && <p className="text-xs text-destructive">{j.last_error}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <StatusPill tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}{j.attempts > 1 ? ` · try ${j.attempts}` : ""}</StatusPill>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {j.status === "failed" && j.local_id && j.entity_type === "invoice" && (
                        <Button variant="ghost" size="sm" onClick={() => run(`retry-${j.id}`, async () => {
                          const { error } = await supabase.rpc("accounting_sync_invoice", { _invoice_id: j.local_id! });
                          if (error) throw new Error(error.message);
                          await accountingCall({ action: "sync" });
                          await load();
                        })}>
                          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
