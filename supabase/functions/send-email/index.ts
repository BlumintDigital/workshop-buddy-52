import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "https://ieq.shoplane.uk";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify caller is admin or manager
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const body = await req.json();
  const { to_user_id, subject, html, mode } = body;
  let { to } = body;

  // bug_report mode: any authenticated user, recipient resolved server-side
  // (admin email is never exposed to the client).
  if (mode === "bug_report") {
    const { data: contact } = await supabase
      .from("workshop_admin_contacts")
      .select("super_admin_email")
      .eq("id", 1)
      .maybeSingle();
    const { data: settings } = await supabase
      .from("workshop_settings")
      .select("contact_email")
      .eq("id", 1)
      .maybeSingle();
    to = (contact as any)?.super_admin_email || (settings as any)?.contact_email || null;
    if (!to) {
      return new Response(JSON.stringify({ error: "No admin recipient configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    // Default path: admin/manager only
    if (!roleRow || !["admin", "manager"].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Resolve email from user_id when caller doesn't have the address directly
    if (!to && to_user_id) {
      const { data: { user: targetUser }, error: lookupError } =
        await supabase.auth.admin.getUserById(to_user_id);
      if (lookupError || !targetUser?.email) {
        return new Response(JSON.stringify({ error: "Could not resolve recipient email" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      to = targetUser.email;
    }
  }

  // Enforce admin-controlled email_notifications_enabled toggle server-side.
  // The toggle lives in admin-only workshop_settings and must never be readable by clients.
  const { data: emailCfg } = await supabase
    .from("workshop_settings")
    .select("email_notifications_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (!(emailCfg as any)?.email_notifications_enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: "email_notifications_disabled" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY secret not configured" }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!to || !subject || !html) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: to (or to_user_id), subject, html" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Read from_email from workshop_settings so it's configurable without redeploying
  const { data: settings } = await supabase
    .from("workshop_settings")
    .select("from_email")
    .eq("id", 1)
    .maybeSingle();
  const from = settings?.from_email || Deno.env.get("FROM_EMAIL") || "noreply@workshopmanager.com";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: text }), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
