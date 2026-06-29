import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const LIMIT = { limit: 3, windowSec: 60 * 60, lockoutSec: 60 * 60 };

function generateCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const chars = Array.from(buf).map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

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

    const rl = await checkRateLimit(userId, "backup_generate", LIMIT);
    if (!rl.allowed) {
      return json(
        {
          error: "Too many regeneration attempts. Please try again later.",
          retry_after_sec: rl.retryAfterSec,
          locked_until: rl.lockedUntil,
        },
        429,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await admin.from("mfa_backup_codes").delete().eq("user_id", userId);

    const codes: string[] = [];
    const rows: { user_id: string; code_hash: string }[] = [];
    for (let i = 0; i < CODE_COUNT; i++) {
      const code = generateCode();
      codes.push(code);
      rows.push({ user_id: userId, code_hash: await sha256Hex(code) });
    }

    const { error } = await admin.from("mfa_backup_codes").insert(rows);
    if (error) throw error;

    return json({ codes, remaining_regenerations: rl.remaining });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
