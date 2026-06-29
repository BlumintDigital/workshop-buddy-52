import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: buildCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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
      return json({ trusted: false }, 200);
    }

    const userId = claims.claims.sub as string;
    const cookieHeader = req.headers.get("Cookie") ?? "";
    const match = cookieHeader.match(/(?:^|;\s*)mfa_device_token=([^;]+)/);
    const deviceToken = match?.[1];
    if (!deviceToken) return json({ trusted: false });

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

    if (qErr || !data) return json({ trusted: false });

    if (new Date(data.expires_at).getTime() < Date.now()) {
      await admin.from("mfa_trusted_devices").delete().eq("id", data.id);
      return json({ trusted: false });
    }

    await admin
      .from("mfa_trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);

    return json({ trusted: true });
  } catch (_err) {
    return json({ trusted: false });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
  });
}
