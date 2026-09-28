import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const TRUST_DAYS = 30;
const LIMIT = { limit: 5, windowSec: 60 * 60, lockoutSec: 60 * 60 };

// Trusts this browser for 30 days, after the user has entered a 2FA code.
// The token comes back in the body and the browser keeps it; only its hash
// is stored here.
serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    // Only a session that has just passed 2FA may trust a browser.
    if ((claims.claims as Record<string, unknown>).aal !== "aal2") {
      return json({ error: "Enter your 2FA code before trusting this browser." }, 403);
    }

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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const expiresAt = new Date(Date.now() + TRUST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from("mfa_trusted_devices").insert({
      user_id: userId,
      token_hash: await sha256Hex(opaque),
      device_label: deviceLabel,
      expires_at: expiresAt,
    });
    if (error) throw error;

    return json({ ok: true, device_token: opaque, expires_at: expiresAt });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
