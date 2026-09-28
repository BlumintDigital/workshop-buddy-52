// Notices from the connected finance system: POST ?provider=quickbooks|xero|webhook.
// Each is checked against that system's signature before anything happens.
// Payments are recorded against the matching Shoplane invoices.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProvider } from "../_shared/accounting/registry.ts";
import { handleWebhookEvents, loadContext, processQueue } from "../_shared/accounting/engine.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const providerId = new URL(req.url).searchParams.get("provider") ?? "";
  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return new Response("Unknown provider", { status: 404 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const raw = await req.text();
  const { ctx } = await loadContext(admin, provider.id);
  if (!(await provider.verifyWebhook(ctx, req.headers, raw))) return new Response("Invalid signature", { status: 401 });
  if (!ctx.connection.active || ctx.connection.status !== "connected") return new Response("Not connected", { status: 200 });

  let events;
  try {
    events = provider.parseWebhook(raw);
  } catch {
    return new Response("Unreadable body", { status: 400 });
  }
  await handleWebhookEvents(admin, provider.id, events);

  // Answer quickly (Xero expects a reply within seconds) and do the work after.
  const work = processQueue(admin).catch(() => undefined);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else await work;
  return new Response("OK", { status: 200 });
});
