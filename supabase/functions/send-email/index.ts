import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";


serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
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
  let from: string;

  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;")
     .replace(/'/g, "&#39;");

  // test_email mode: admin only; sends a real email to the Platform Support Email using
  // current settings and returns the raw Resend response for diagnostics.
  if (mode === "test_email") {
    if (!roleRow || roleRow.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const [{ data: adminContact }, { data: ws }] = await Promise.all([
      supabase.from("workshop_admin_contacts").select("super_admin_email").eq("id", 1).maybeSingle(),
      supabase.from("workshop_settings").select("from_email").eq("id", 1).maybeSingle(),
    ]);
    const toAddr = (adminContact as any)?.super_admin_email ?? null;
    if (!toAddr) {
      return new Response(JSON.stringify({ ok: false, error: "No Platform Support Email configured in Settings → Email" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const fromAddr = (ws as any)?.from_email || "noreply@workshopmanager.com";
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "RESEND_API_KEY secret not configured" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const testRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddr,
        to: toAddr,
        subject: "Test email — Workshop Manager",
        html: "<p>If you receive this, your email configuration is working correctly.</p>",
      }),
    });
    if (!testRes.ok) {
      const text = await testRes.text();
      // Always return 200 so supabase-js puts the body in `data` (not `error`)
      return new Response(JSON.stringify({ ok: false, error: text }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, sentTo: toAddr }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // bug_report mode: any authenticated user may send; recipient resolved server-side
  // from workshop_admin_contacts so the platform support email is never exposed to clients.
  // Intentionally bypasses email_notifications_enabled — bug reports are admin-to-admin alerts.
  if (mode === "bug_report") {
    // Rate limit: max 3 reports per user per hour to prevent inbox spam
    const { count: recentCount } = await supabase
      .from("activity_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("table_name", "bug_reports")
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString()) as unknown as { count: number | null };
    if ((recentCount ?? 0) >= 3) {
      return new Response(JSON.stringify({ ok: false, error: "Rate limit: max 3 bug reports per hour" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const [{ data: adminContact }, { data: ws }] = await Promise.all([
      supabase.from("workshop_admin_contacts").select("super_admin_email").eq("id", 1).maybeSingle(),
      supabase.from("workshop_settings").select("from_email").eq("id", 1).maybeSingle(),
    ]);
    to = (adminContact as any)?.super_admin_email ?? null;
    if (!to) {
      return new Response(JSON.stringify({ error: "No Platform Support Email configured in Settings → Email" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    from = (ws as any)?.from_email || Deno.env.get("FROM_EMAIL") || "noreply@workshopmanager.com";

    // Sanitize client-supplied content — never trust raw HTML.
    const rawSubject = typeof subject === "string" ? subject : "";
    const safeSubject = rawSubject.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "(no subject)";
    subject = `[Bug Report] ${safeSubject}`;

    const report = (body as any).report ?? {};
    const rep = {
      title: String(report.title ?? "").slice(0, 200),
      description: String(report.description ?? "").slice(0, 10000),
      severity: ["low", "medium", "high"].includes(String(report.severity)) ? String(report.severity) : "medium",
      pageUrl: String(report.pageUrl ?? "").slice(0, 500),
      submitterName: String(report.submitterName ?? user.email ?? "A user").slice(0, 200),
      feedbackLink: String(report.feedbackLink ?? "").slice(0, 500),
    };

    // Legacy fallback: caller sent only `html`. Strip tags into plain text.
    if (!rep.title && !rep.description && typeof html === "string") {
      rep.description = html.replace(/<[^>]*>/g, " ").trim().slice(0, 10000);
    }

    const sevColor = rep.severity === "high" ? "#dc2626" : rep.severity === "medium" ? "#d97706" : "#16a34a";
    const sevBg = rep.severity === "high" ? "#fef2f2" : rep.severity === "medium" ? "#fffbeb" : "#f0fdf4";
    const safePageUrl = /^https?:\/\//i.test(rep.pageUrl) ? rep.pageUrl : "";
    const safeFeedback = /^https?:\/\//i.test(rep.feedbackLink) ? rep.feedbackLink : "";
    const submitterEmail = user.email ?? "";

    html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb">
        <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;color:#ffffff">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px">Workshop Manager &middot; Issue Report</div>
          <div style="font-size:22px;font-weight:700;line-height:1.3;color:#ffffff">${escapeHtml(rep.title || "(no title)")}</div>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <div style="margin-bottom:20px">
            <span style="display:inline-block;background:${sevBg};color:${sevColor};border:1px solid ${sevColor}33;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(rep.severity)} severity</span>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px">
            <tr><td style="padding:14px 16px;font-size:13px;color:#374151">
              <div style="margin-bottom:6px"><strong style="color:#111827">Submitted by:</strong> ${escapeHtml(rep.submitterName)}${submitterEmail ? ` &lt;${escapeHtml(submitterEmail)}&gt;` : ""}</div>
              ${safePageUrl ? `<div><strong style="color:#111827">Page:</strong> <a href="${escapeHtml(safePageUrl)}" style="color:#2563eb;text-decoration:none">${escapeHtml(safePageUrl)}</a></div>` : ""}
            </td></tr>
          </table>
          <div style="font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Description</div>
          <div style="font-size:15px;line-height:1.6;color:#1f2937;white-space:pre-wrap;background:#ffffff;border-left:3px solid ${sevColor};padding:8px 0 8px 14px;margin-bottom:28px">${escapeHtml(rep.description || "(no description)")}</div>
          ${safeFeedback ? `<div style="text-align:center;margin-top:8px"><a href="${escapeHtml(safeFeedback)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View in dashboard &rarr;</a></div>` : ""}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center">
          This is an automated issue report from Workshop Manager.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  } else {
    // All other emails: admin or manager only, and respect the notification toggle.
    if (!roleRow || !["admin", "manager"].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Per-user rate limit: 60 transactional emails per hour, 15-min lockout on overflow.
    const rl = await checkRateLimit(user.id, "send_email", {
      limit: 60,
      windowSec: 3600,
      lockoutSec: 900,
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded — too many emails",
          retryAfterSec: rl.retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfterSec),
          },
        },
      );
    }

    const { data: emailCfg } = await supabase
      .from("workshop_settings")
      .select("email_notifications_enabled, from_email")
      .eq("id", 1)
      .maybeSingle();

    if (!(emailCfg as any)?.email_notifications_enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "email_notifications_disabled" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    from = (emailCfg as any)?.from_email || Deno.env.get("FROM_EMAIL") || "noreply@workshopmanager.com";

    // Resolve email from user_id when the caller doesn't have the address directly
    if (!to && to_user_id) {
      const { data: { user: targetUser }, error: lookupError } =
        await supabase.auth.admin.getUserById(to_user_id);
      if (lookupError || !targetUser?.email) {
        return new Response(JSON.stringify({ error: "Could not resolve recipient email" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      to = targetUser.email;
    }
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: "RESEND_API_KEY secret not configured" }),
      { status: 503, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  if (!to || !subject || !html) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: to (or to_user_id), subject, html" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

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
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
