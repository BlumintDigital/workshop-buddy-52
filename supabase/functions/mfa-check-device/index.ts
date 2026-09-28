import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";

// Is this browser trusted to skip the 2FA code? When it is, the current
// sign-in session is recorded as vouched for, which the database rules
// accept in place of a fresh code (see public.mfa_satisfied()).
serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ trusted: false });

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claims?.claims) return json({ trusted: false });

    const userId = claims.claims.sub as string;
    const sessionId = (claims.claims as Record<string, unknown>).session_id as string | undefined;
    // The browser keeps its token and sends it as a header. (It used to be a
    // cross-site cookie, which browsers block, so no browser holds a working one.)
    const deviceToken = req.headers.get("X-Device-Token");
    if (!deviceToken || !sessionId) return json({ trusted: false });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: device, error: qErr } = await admin
      .from("mfa_trusted_devices")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("token_hash", await sha256Hex(deviceToken))
      .maybeSingle();
    if (qErr || !device) return json({ trusted: false });

    if (new Date(device.expires_at).getTime() < Date.now()) {
      await admin.from("mfa_trusted_devices").delete().eq("id", device.id);
      return json({ trusted: false });
    }

    const { error: sErr } = await admin.from("mfa_trusted_sessions").upsert({
      session_id: sessionId,
      user_id: userId,
      device_id: device.id,
      expires_at: device.expires_at,
    });
    if (sErr) throw sErr;
    await admin.from("mfa_trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", device.id);

    return json({ trusted: true, expires_at: device.expires_at });
  } catch (err) {
    console.error("mfa-check-device", (err as Error).message);
    return json({ trusted: false });
  }
});
