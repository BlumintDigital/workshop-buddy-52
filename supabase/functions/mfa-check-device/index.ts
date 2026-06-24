import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ trusted: false, _dbg: "no_auth_header" }, 200);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return json({ trusted: false, _dbg: "claims_err", _msg: claimsErr?.message }, 200);
    }

    const userId = claims.claims.sub as string;
    const body = await req.json().catch(() => ({}));
    const deviceToken = body.token as string | undefined;
    if (!deviceToken) return json({ trusted: false, _dbg: "no_token", _user: userId });

    const hash = await sha256Hex(deviceToken);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error: qErr } = await admin
      .from("mfa_trusted_devices")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("token_hash", hash)
      .maybeSingle();

    if (qErr) return json({ trusted: false, _dbg: "query_err", _msg: qErr.message, _user: userId, _hash: hash });
    if (!data) {
      return json({ trusted: false, _dbg: "no_row", _user: userId, _hash: hash });
    }
    if (new Date(data.expires_at).getTime() < Date.now()) {
      await admin.from("mfa_trusted_devices").delete().eq("id", data.id);
      return json({ trusted: false, _dbg: "expired" });
    }

    await admin
      .from("mfa_trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);

    return json({ trusted: true });
  } catch (err) {
    return json({ trusted: false, _err: (err as Error).message });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
