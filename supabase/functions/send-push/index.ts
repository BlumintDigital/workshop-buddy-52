import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return err("POST required", 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);
    const token = authHeader.slice("Bearer ".length);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return err("Unauthorized", 401);
    const callerId = claimsData.claims.sub as string;

    // Service-role client for elevated reads/writes
    const admin = createClient(supabaseUrl, serviceKey);

    // Authorize: admin or manager only
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .in("role", ["admin", "manager"])
      .limit(1)
      .maybeSingle();
    if (!roleRow) return err("Forbidden — admin or manager role required", 403);

    // Per-user rate limit: 30 pushes per hour, 15-min lockout on overflow.
    const rl = await checkRateLimit(callerId, "send_push", {
      limit: 30,
      windowSec: 3600,
      lockoutSec: 900,
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded — too many push notifications",
          retryAfterSec: rl.retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfterSec),
          },
        },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return err("Invalid JSON body");
    const { user_ids, title, body: message, url } = body as {
      user_ids?: string[];
      title?: string;
      body?: string;
      url?: string;
    };
    if (!title || typeof title !== "string") return err("title is required");
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return err("user_ids (non-empty array) is required");
    }

    // Load VAPID public key from admin contacts; private key from server-side secret only.
    const { data: contact } = await admin
      .from("workshop_admin_contacts" as any)
      .select("vapid_public_key, super_admin_email")
      .eq("id", 1)
      .maybeSingle();
    const vapidPublicKey =
      ((contact as any)?.vapid_public_key as string | null) ||
      Deno.env.get("VAPID_PUBLIC_KEY") ||
      null;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || null;
    if (!vapidPublicKey || !vapidPrivateKey) {
      return err("VAPID keys are not configured for this workshop", 503);
    }

    const { data: ws } = await admin
      .from("workshop_settings")
      .select("contact_email")
      .eq("id", 1)
      .maybeSingle();
    const subjectEmail =
      (ws as any)?.contact_email ||
      (contact as any)?.super_admin_email ||
      "admin@example.com";

    webpush.setVapidDetails(`mailto:${subjectEmail}`, vapidPublicKey, vapidPrivateKey);

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions" as any)
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", user_ids);
    if (subsErr) return err(subsErr.message, 500);

    if (!subs || subs.length === 0) {
      return json({ sent: 0, total: 0, expired: 0, message: "No subscribers for those users" });
    }

    const payload = JSON.stringify({
      title,
      body: message ?? "",
      url: url ?? "/",
    });

    let sent = 0;
    const expiredIds: number[] = [];

    for (const sub of subs as Array<{
      id: number;
      endpoint: string;
      p256dh: string;
      auth_key: string;
    }>) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          expiredIds.push(sub.id);
        }
      }
    }

    if (expiredIds.length) {
      await admin.from("push_subscriptions" as any).delete().in("id", expiredIds);
    }

    return json({ sent, total: subs.length, expired: expiredIds.length });
  } catch (e) {
    await captureEdgeError(e, "send-push");
    return err((e as Error).message, 500);
  }
});
