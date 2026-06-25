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
  const { to_user_id, mode } = body;
  let { subject, html } = body as { subject?: string; html?: string };
  let { to } = body;

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;")
     .replace(/'/g, "&#39;");

  // bug_report mode: any authenticated user may send; recipient resolved server-side
  // so the admin's email address is never exposed to the client.
  if (mode === "bug_report") {
    const { data: ws } = await supabase
      .from("workshop_settings")
      .select("contact_email")
      .eq("id", 1)
      .maybeSingle();
    to = (ws as any)?.contact_email ?? null;
    if (!to) {
      return new Response(JSON.stringify({ error: "No admin contact email configured in Settings" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize client-supplied content — strip tags, escape remaining chars.
    const rawSubject = typeof subject === "string" ? subject : "";
    const safeSubject = rawSubject.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "(no subject)";
    subject = `[Bug Report] ${safeSubject}`;

    const rawHtml = typeof html === "string" ? html : "";
    const plain = rawHtml.replace(/<[^>]*>/g, " ").slice(0, 10000);
    html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">
  <p><strong>Submitted by:</strong> ${escapeHtml(user.email ?? user.id)}</p>
  <hr/>
  <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(plain)}</pre>
</div>`;
  } else {
    // All other emails: admin or manager only
    if (!roleRow || !["admin", "manager"].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Resolve email from user_id when the caller doesn't have the address directly
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

  // Enforce the email_notifications_enabled toggle server-side for all paths.
  const { data: emailCfg } = await supabase
    .from("workshop_settings")
    .select("email_notifications_enabled, from_email")
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

  const from = (emailCfg as any)?.from_email || Deno.env.get("FROM_EMAIL") || "noreply@workshopmanager.com";

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
