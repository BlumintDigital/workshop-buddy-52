import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[mfa-check-device] no auth header");
      return json({ trusted: false }, 200);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      console.log("[mfa-check-device] claims error", claimsErr?.message);
      return json({ trusted: false }, 200);
    }

    const userId = claims.claims.sub as string;
    const body = await req.json().catch(() => ({}));
    const deviceToken = body.token as string | undefined;
    console.log("[mfa-check-device] user", userId, "tokenLen", deviceToken?.length ?? 0);
    if (!deviceToken) return json({ trusted: false });

    const hash = await sha256Hex(deviceToken);
    console.log("[mfa-check-device] hash", hash);

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

    if (qErr) console.log("[mfa-check-device] query error", qErr.message);
    if (!data) {
      console.log("[mfa-check-device] no row matched");
      return json({ trusted: false });
    }
    if (new Date(data.expires_at).getTime() < Date.now()) {
      console.log("[mfa-check-device] expired");
      await admin.from("mfa_trusted_devices").delete().eq("id", data.id);
      return json({ trusted: false });
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
