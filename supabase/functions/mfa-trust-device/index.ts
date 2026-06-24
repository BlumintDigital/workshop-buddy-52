import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const TRUST_DAYS = 30;
const LIMIT = { limit: 5, windowSec: 60 * 60, lockoutSec: 60 * 60 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claims.claims.sub as string;

    const rl = await checkRateLimit(userId, "trust_device", LIMIT);
    if (!rl.allowed) {
      return json(
        {
          error: "Too many trust-device requests. Please try again later.",
          retry_after_sec: rl.retryAfterSec,
          locked_until: rl.lockedUntil,
        },
        429,
      );
    }

    const body = await req.json().catch(() => ({}));
    const deviceLabel: string = (body.device_label as string)?.slice(0, 200) || "Unknown device";

    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const opaque = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const hash = await sha256Hex(opaque);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await admin.from("mfa_trusted_devices").insert({
      user_id: userId,
      token_hash: hash,
      device_label: deviceLabel,
      expires_at: expiresAt,
    });
    if (error) throw error;

    return json({ token: opaque, expires_at: expiresAt });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
