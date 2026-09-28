// Accounting integrations: connect, configure and sync.
//
// POST { action, ... } with the signed-in user's token.
//   status                  admins, managers, billing staff: systems, what's missing, recent sync log
//   sync                    admins, managers, billing staff: run due jobs now
//   connect  {provider, app_url, url?}   admins: start sign-in (or connect directly)
//   disconnect {provider}   admins
//   test {provider}         admins: check the connection works
//   options {provider}      admins: tax codes, products, accounts to map to
//   settings {provider, settings}  admins
//   reveal-secret {provider}       admins: the webhook connector's signing secret
//   simulate-payment {invoice_id}  admins, test connection only

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";
import { PROVIDERS, getProvider } from "../_shared/accounting/registry.ts";
import { loadContext, processQueue } from "../_shared/accounting/engine.ts";
import { simulatePayment } from "../_shared/accounting/test.ts";
import { randomSecret } from "../_shared/accounting/util.ts";
import type { ConnectionSettings } from "../_shared/accounting/types.ts";

const SETTING_KEYS: (keyof ConnectionSettings)[] = [
  "tax_code", "tax_code_zero", "item_id", "account_code", "payment_account_code", "numbering", "send_from", "sync_from", "url",
];

function redirectUri(): string {
  return Deno.env.get("ACCOUNTING_REDIRECT_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/accounting-callback`;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);
    if (!(await sessionVerified(authHeader))) return json({ error: MFA_REQUIRED }, 403);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    const isAdmin = roleRow?.role === "admin";
    const { data: canBill } = await admin.rpc("can_bill", { _uid: user.id });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const needAdmin = !["status", "sync"].includes(action);
    if (needAdmin ? !isAdmin : !canBill) return json({ error: "You don't have access to accounting integrations" }, 403);

    if (action === "status") {
      const [{ data: conns }, { data: log }] = await Promise.all([
        admin.from("accounting_connections").select("provider, status, active, org_id, org_name, settings, connected_at, last_sync_at, last_error").order("provider"),
        admin.from("accounting_queue").select("id, provider, entity_type, local_id, external_id, action, status, attempts, last_error, result, created_at, finished_at").order("id", { ascending: false }).limit(50),
      ]);
      const { count: pending } = await admin.from("accounting_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
      const { count: failed } = await admin.from("accounting_queue").select("id", { count: "exact", head: true }).eq("status", "failed");
      return json({
        redirect_uri: redirectUri(),
        webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/accounting-webhook`,
        providers: Object.values(PROVIDERS).map((p) => ({
          id: p.id,
          label: p.label,
          auth: p.auth,
          can_send: p.canSend,
          can_poll: p.canPoll,
          required_env: p.requiredEnv,
          missing_env: p.requiredEnv.filter((n) => !Deno.env.get(n)),
          webhook_ready: p.id === "quickbooks" ? !!Deno.env.get("QUICKBOOKS_WEBHOOK_VERIFIER") : p.id === "xero" ? !!Deno.env.get("XERO_WEBHOOK_KEY") : p.id === "webhook",
          connection: (conns ?? []).find((c) => c.provider === p.id) ?? null,
        })),
        queue: { pending: pending ?? 0, failed: failed ?? 0 },
        log: log ?? [],
      });
    }

    if (action === "sync") return json(await processQueue(admin));

    const providerId = String(body?.provider ?? "");
    const provider = action === "simulate-payment" ? getProvider("test") : getProvider(providerId);
    const missing = provider.requiredEnv.filter((n) => !Deno.env.get(n));

    if (action === "connect") {
      if (missing.length) return json({ error: `Set ${missing.join(" and ")} on the server first (Supabase → Edge Functions → Secrets).` }, 400);
      const now = new Date().toISOString();
      if (provider.auth === "oauth2") {
        const state = randomSecret(16);
        const appUrl = String(body?.app_url ?? "").replace(/\/$/, "");
        await admin.from("accounting_secrets").upsert({
          provider: provider.id,
          extra: { oauth_state: state, oauth_started_at: now, oauth_user: user.id, app_url: appUrl },
          updated_at: now,
        });
        const url = provider.authorizeUrl!({ env: (n) => Deno.env.get(n) }, state, redirectUri());
        return json({ authorize_url: url });
      }
      // Webhook and test connectors connect straight away.
      const settings: ConnectionSettings = {};
      if (provider.id === "webhook") {
        const url = String(body?.url ?? "");
        if (!/^https:\/\//i.test(url)) return json({ error: "Give an https:// address for the webhook." }, 400);
        settings.url = url;
      }
      const secret = provider.auth === "secret" ? randomSecret() : null;
      await admin.from("accounting_connections").update({ active: false }).neq("provider", provider.id);
      await admin.from("accounting_connections").update({
        status: "connected",
        active: true,
        org_id: provider.id,
        org_name: provider.id === "test" ? "Shoplane test books" : settings.url ? new URL(settings.url).host : null,
        settings: { numbering: "provider", send_from: "shoplane", ...settings },
        connected_by: user.id,
        connected_at: now,
        last_error: null,
        updated_at: now,
      }).eq("provider", provider.id);
      await admin.from("accounting_secrets").upsert({ provider: provider.id, webhook_secret: secret, extra: {}, updated_at: now });
      return json({ connected: true, webhook_secret: secret });
    }

    if (action === "disconnect") {
      await admin.from("accounting_connections").update({ status: "disconnected", active: false, last_error: null, updated_at: new Date().toISOString() }).eq("provider", provider.id);
      await admin.from("accounting_secrets").delete().eq("provider", provider.id);
      // Pending work can't go anywhere now.
      await admin.from("accounting_queue").update({ status: "failed", last_error: "Disconnected", finished_at: new Date().toISOString() }).eq("provider", provider.id).in("status", ["queued", "running"]);
      return json({ disconnected: true });
    }

    const { ctx } = await loadContext(admin, provider.id);
    if (ctx.connection.status !== "connected") return json({ error: `${provider.label} isn't connected` }, 400);

    if (action === "test") {
      const result = await provider.testConnection(ctx);
      if (result.org_name) await admin.from("accounting_connections").update({ org_name: result.org_name }).eq("provider", provider.id);
      return json({ ok: true, ...result });
    }
    if (action === "options") return json(await provider.listOptions(ctx));
    if (action === "settings") {
      const incoming = (body?.settings ?? {}) as Record<string, unknown>;
      const settings: Record<string, unknown> = { ...ctx.connection.settings };
      for (const k of SETTING_KEYS) if (k in incoming) settings[k] = incoming[k] === "" ? undefined : incoming[k];
      if (settings.numbering && !["provider", "shoplane"].includes(String(settings.numbering))) return json({ error: "Numbering must be provider or shoplane" }, 400);
      if (settings.send_from && !["provider", "shoplane"].includes(String(settings.send_from))) return json({ error: "Sending must be provider or shoplane" }, 400);
      if (settings.send_from === "provider" && !provider.canSend) return json({ error: `${provider.label} can't email invoices` }, 400);
      await admin.from("accounting_connections").update({ settings, updated_at: new Date().toISOString() }).eq("provider", provider.id);
      return json({ settings });
    }
    if (action === "reveal-secret") return json({ webhook_secret: ctx.secrets.webhook_secret });
    if (action === "simulate-payment") {
      const { data: l } = await admin.from("accounting_links").select("external_id").eq("provider", "test").eq("entity_type", "invoice").eq("local_id", String(body?.invoice_id ?? "")).maybeSingle();
      if (!l) return json({ error: "That invoice hasn't synced to the test books yet." }, 400);
      await simulatePayment(ctx, l.external_id);
      await admin.rpc("accounting_enqueue", { _provider: "test", _entity: "remote_invoice", _local: null, _external: l.external_id, _action: "pull" });
      return json({ simulated: true, sync: await processQueue(admin) });
    }
    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
