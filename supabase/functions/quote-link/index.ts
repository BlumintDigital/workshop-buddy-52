// Quote approval by secure link.
//
// POST { action: "create", quote_id, email?, send? }   signed-in team (Reception or Project planning)
//   → { url, sent_to?, emailed? }  Makes a new link (earlier ones stop working); optionally emails it.
// POST { action: "view", token }                        public
//   → { state, workshop, project, customer, quote, expires_at }
// POST { action: "decide", token, accept, name, note? } public
//   → { status }
//
// The token is random and only its hash is stored. The public actions use the service role but
// can only reach the one quote the token belongs to (quote_link_view / decide_quote_by_link).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function emailHtml(o: { workshop: string; label: string; title: string; total: string; url: string; validUntil: string | null }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16201a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3e6e2">
<tr><td style="padding:28px 32px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#56615a">${esc(o.workshop)}</td></tr>
<tr><td style="padding:0 32px;font-size:24px;font-weight:700;line-height:1.25">Your quote is ready to approve</td></tr>
<tr><td style="padding:14px 32px 0;font-size:15px;line-height:1.6;color:#3d4842">
${esc(o.title)}<br><strong>${esc(o.label)} · ${esc(o.total)}</strong>${o.validUntil ? `<br>Valid until ${esc(o.validUntil)}` : ""}</td></tr>
<tr><td style="padding:24px 32px"><a href="${esc(o.url)}" style="display:inline-block;background:#2e6a4c;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:8px">View and approve the quote</a></td></tr>
<tr><td style="padding:0 32px 28px;font-size:13px;line-height:1.6;color:#6b7570">You don't need an account. Open the link, check the lines and press Approve or Decline. If you have questions, reply to this email or call ${esc(o.workshop)}.</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  const cors = { ...buildCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  try {
    // ---------------------------------------------------------------- public: view
    if (action === "view") {
      const token = String(body.token ?? "");
      if (!TOKEN.test(token)) return json({ state: "invalid" });
      const { data, error } = await admin.rpc("quote_link_view", { _token: token });
      if (error) throw error;
      return json(data);
    }

    // ---------------------------------------------------------------- public: decide
    if (action === "decide") {
      const token = String(body.token ?? "");
      if (!TOKEN.test(token)) return json({ error: "This link is no longer valid" }, 400);
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
      const { data, error } = await admin.rpc("decide_quote_by_link", {
        _token: token,
        _accept: body.accept === true,
        _name: String(body.name ?? ""),
        _note: body.note ? String(body.note) : null,
        _ip: ip,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ status: data });
    }

    // ---------------------------------------------------------------- team: create (and email)
    if (action === "create") {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Sign in again." }, 401);
      const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: claims } = await db.auth.getClaims(authHeader.slice(7));
      if (!claims?.claims?.sub) return json({ error: "Sign in again." }, 401);
      if (!(await sessionVerified(authHeader))) return json({ error: MFA_REQUIRED }, 403);

      const quoteId = String(body.quote_id ?? "");
      const typed = String(body.email ?? "").trim().toLowerCase();
      if (typed && !EMAIL.test(typed)) return json({ error: "That email address doesn't look right" }, 400);

      // Who it goes to: the address typed, else the walk-in contact, else the portal client.
      const { data: q } = await admin.from("project_quotes").select("id, job_id, kind, number, title, subtotal, currency, valid_until").eq("id", quoteId).maybeSingle();
      if (!q) return json({ error: "Quote not found" }, 404);
      const { data: job } = await admin.from("jobs").select("id, ref, title, contact_email, client_id").eq("id", q.job_id).maybeSingle();
      let recipient = typed || job?.contact_email || "";
      if (!recipient && job?.client_id) {
        const { data: u } = await admin.auth.admin.getUserById(job.client_id);
        recipient = u?.user?.email ?? "";
      }

      // The user's own session makes the link, so the database checks they may share quotes.
      const { data: token, error } = await db.rpc("create_quote_link", { _quote_id: quoteId, _sent_to: body.send ? recipient || null : null });
      if (error) return json({ error: error.message }, 400);
      const site = (Deno.env.get("PUBLIC_SITE_URL") || req.headers.get("origin") || "").replace(/\/$/, "");
      const link = `${site}/q/${token}`;

      if (!body.send) return json({ url: link });
      if (!recipient) return json({ url: link, emailed: false, reason: "No email address on this project. Copy the link and send it yourself." });

      const [{ data: ws }, key] = [await admin.from("workshop_settings").select("workshop_name, from_email, email_notifications_enabled").eq("id", 1).maybeSingle(), Deno.env.get("RESEND_API_KEY")];
      if (!ws?.email_notifications_enabled || !key) {
        return json({ url: link, emailed: false, reason: "Emails are switched off for this workshop. Copy the link and send it yourself." });
      }
      const label = `${job?.ref ?? ""}-${q.kind === "quote" ? "Q" : "CR"}${q.number}`;
      const total = new Intl.NumberFormat("en-GB", { style: "currency", currency: q.currency || "GBP" }).format(Number(q.subtotal) || 0);
      const workshop = ws.workshop_name || "Your workshop";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${workshop} <${ws.from_email || Deno.env.get("FROM_EMAIL")}>`,
          to: recipient,
          subject: `Quote ${label} from ${workshop}`,
          html: emailHtml({
            workshop, label, total, url: link,
            title: q.title || job?.title || "Your quote",
            validUntil: q.valid_until ? new Date(`${q.valid_until}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null,
          }),
        }),
      });
      if (!res.ok) {
        await captureEdgeError(new Error(`quote-link email failed: ${res.status} ${await res.text()}`), "quote-link");
        return json({ url: link, emailed: false, reason: "The email didn't send. Copy the link and send it yourself." });
      }
      return json({ url: link, emailed: true, sent_to: recipient });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    await captureEdgeError(e, "quote-link");
    return json({ error: "Something went wrong. Try again shortly." }, 500);
  }
});
