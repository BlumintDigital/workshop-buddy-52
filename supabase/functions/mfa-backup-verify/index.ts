import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit, recordFailure, resetRateLimit } from "../_shared/rate-limit.ts";

const LIMIT = { limit: 5, windowSec: 15 * 60, lockoutSec: 15 * 60 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: buildCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const userId = claims.claims.sub as string;

    // Pre-check lockout without consuming a slot
    const pre = await checkRateLimit(userId, "backup_verify", LIMIT, false);
    if (!pre.allowed) {
      return json(
        {
          error: "Too many failed attempts. Try again later.",
          retry_after_sec: pre.retryAfterSec,
          locked_until: pre.lockedUntil,
          remaining_attempts: 0,
        },
        429,
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawCode = (body.code as string | undefined)?.trim().toUpperCase();
    if (!rawCode) return json({ error: "Code required" }, 400);

    const normalized = rawCode.replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{8}$/.test(normalized)) {
      const rl = await recordFailure(userId, "backup_verify", LIMIT);
      return json(
        {
          error: "Invalid backup code format",
          remaining_attempts: rl.remaining,
        },
        400,
      );
    }

    const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
    const hash = await sha256Hex(formatted);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await admin
      .from("mfa_backup_codes")
      .select("id, used_at")
      .eq("user_id", userId)
      .eq("code_hash", hash)
      .maybeSingle();

    if (!data) {
      const rl = await recordFailure(userId, "backup_verify", LIMIT);
      return json(
        {
          error: "Invalid backup code",
          remaining_attempts: rl.remaining,
          retry_after_sec: rl.retryAfterSec,
          locked_until: rl.lockedUntil,
        },
        400,
      );
    }
    if (data.used_at) {
      const rl = await recordFailure(userId, "backup_verify", LIMIT);
      return json(
        {
          error: "This backup code has already been used",
          remaining_attempts: rl.remaining,
        },
        400,
      );
    }

    await admin
      .from("mfa_backup_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.id);

    await resetRateLimit(userId, "backup_verify");

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
  });
}
