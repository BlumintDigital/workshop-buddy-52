// Tells the sign-up form whether an invite code is good, without using it up.
// The code is redeemed by the database when the account is actually created
// (public.handle_new_user), so this is only early feedback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

// Anyone can call this before they have an account, so cap guesses per address
// (per warm instance; the database-side redemption is the real gate).
const MAX_PER_10_MIN = 10;
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_10_MIN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooMany(ip)) return json({ valid: false, error: "Too many attempts. Wait a few minutes and try again." }, 429);

  try {
    const body = await req.json().catch(() => null);
    const code = (body?.code ?? "").toString().trim();
    if (!code || code.length > 64) return json({ valid: false, error: "Invite code required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin.rpc("peek_signup_code", { _code: code });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.valid) return json({ valid: false });
    return json({ valid: true, role: row.role });
  } catch (e) {
    await captureEdgeError(e, "validate-signup-code");
    return json({ valid: false, error: "Couldn't check the code. Try again." }, 500);
  }
});
