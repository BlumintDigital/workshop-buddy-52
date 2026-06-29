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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const code = (body?.code ?? "").toString().trim();
    if (!code) return json({ valid: false, error: "Invite code required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // redeem_signup_code now returns a table row: { valid, role }
    const { data, error } = await admin.rpc("redeem_signup_code", { _code: code });
    if (error) return json({ valid: false, error: error.message }, 500);

    // data is an array of rows (RETURNS TABLE); grab the first row.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.valid) return json({ valid: false });
    return json({ valid: true, role: row.role });
  } catch (e) {
    return json({ valid: false, error: (e as Error).message }, 500);
  }
});
