// Where QuickBooks and Xero send the browser back after "Sign in and allow".
// Matches the one-time state saved by `accounting` connect, exchanges the code
// for tokens and returns the admin to Settings → Integrations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProvider } from "../_shared/accounting/registry.ts";

const STATE_MINUTES = 15;

function redirectUri(): string {
  return Deno.env.get("ACCOUNTING_REDIRECT_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/accounting-callback`;
}

serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const state = params.get("state") ?? "";
  const back = (appUrl: string | null, query: Record<string, string>) =>
    appUrl
      ? Response.redirect(`${appUrl}/admin/settings?${new URLSearchParams({ tab: "integrations", ...query })}`, 302)
      : new Response(query.error ? `Couldn't connect: ${query.error}` : "Connected. You can close this tab.", { status: query.error ? 400 : 200 });

  const { data: pending } = state
    ? await admin.from("accounting_secrets").select("provider, extra").eq("extra->>oauth_state", state).maybeSingle()
    : { data: null };
  if (!pending) return back(null, { error: "This sign-in link has expired. Start again from Settings." });
  const extra = pending.extra as { oauth_started_at?: string; oauth_user?: string; app_url?: string };
  const appUrl = extra.app_url || null;
  if (!extra.oauth_started_at || Date.now() - Date.parse(extra.oauth_started_at) > STATE_MINUTES * 60_000) {
    return back(appUrl, { error: "The sign-in took too long. Try connecting again." });
  }
  if (params.get("error")) return back(appUrl, { error: params.get("error_description") ?? params.get("error")! });
  const { data: accountingOn } = await admin.rpc("is_feature_enabled", { feature_key: "accounting_sync" });
  if (accountingOn === false) return back(appUrl, { error: "Accounting sync is switched off for this workshop." });

  try {
    const provider = getProvider(pending.provider);
    const result = await provider.exchangeCode!({ env: (n) => Deno.env.get(n), fetch }, params, redirectUri());
    const now = new Date().toISOString();

    // A different company or organisation than before: old links would point at the wrong records.
    const { data: before } = await admin.from("accounting_connections").select("org_id").eq("provider", provider.id).single();
    if (before?.org_id && before.org_id !== result.org_id) {
      await admin.from("accounting_links").delete().eq("provider", provider.id);
      await admin.from("accounting_queue").delete().eq("provider", provider.id);
    }

    await admin.from("accounting_secrets").upsert({ provider: provider.id, ...result.secrets, extra: {}, updated_at: now });
    await admin.from("accounting_connections").update({ active: false }).neq("provider", provider.id);
    const { data: current } = await admin.from("accounting_connections").select("settings").eq("provider", provider.id).single();
    await admin.from("accounting_connections").update({
      status: "connected",
      active: true,
      org_id: result.org_id,
      org_name: result.org_name,
      settings: { numbering: "provider", send_from: "shoplane", ...((current?.settings as object) ?? {}) },
      connected_by: extra.oauth_user ?? null,
      connected_at: now,
      last_error: null,
      updated_at: now,
    }).eq("provider", provider.id);
    return back(appUrl, { connected: provider.id });
  } catch (e) {
    return back(appUrl, { error: (e as Error).message });
  }
});
