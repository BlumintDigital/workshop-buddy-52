import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const body = await req.json().catch(() => ({}));
    const code = (body.code as string | undefined)?.trim().toUpperCase();
    if (!code) return json({ error: "Code required" }, 400);

    const hash = await sha256Hex(code);

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

    if (!data) return json({ error: "Invalid backup code" }, 400);
    if (data.used_at) return json({ error: "This backup code has already been used" }, 400);

    await admin
      .from("mfa_backup_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.id);

    return json({ success: true });
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
