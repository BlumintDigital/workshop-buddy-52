// Automatic reminders, woken every 15 minutes by pg_cron (public.run_automatic_reminders).
// For each recipe that is on: find what is due, claim an automation_runs row (unique per
// recipe, subject and step) before sending, send through send-email, and record the outcome.
// Failed sends are recorded and never retried. Quiet between 21:00 and 08:00, Europe/London.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceCall, safeEqual } from "../_shared/session.ts";
import {
  collectionReminderEmail,
  isQuietHours,
  localDate,
  nextIntervalStep,
  nextOverdueStep,
  overdueInvoiceEmail,
  quoteReminderEmail,
  type ReminderEmail,
} from "../_shared/reminders.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const MAX_STEPS = 2;
const MAX_SENDS_PER_RUN = 25;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Recipe = "quote_reminder" | "invoice_overdue" | "collection_reminder";
interface Due {
  recipe: Recipe;
  subjectId: string;
  step: number;
  label: string;
  to?: string;
  toUserId?: string;
  /** Builds the email; may create a quote link, so only called once the run is claimed. */
  email: () => Promise<ReminderEmail>;
}

serve(async (req) => {
  const auth = req.headers.get("Authorization");
  const fromCron = !!AUTOMATION_SECRET && !!auth && safeEqual(auth, `Bearer ${AUTOMATION_SECRET}`);
  if (!fromCron && !isServiceCall(auth)) return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  if (isQuietHours(now)) return json({ ok: true, skipped: "quiet_hours" });
  const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, "");
  if (!site) return json({ ok: true, skipped: "PUBLIC_SITE_URL not set" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  // Email off: claim nothing, so reminders go out normally once it's back on.
  const { data: ws } = await db.from("workshop_settings").select("email_notifications_enabled").eq("id", 1).maybeSingle();
  if (!ws?.email_notifications_enabled) return json({ ok: true, skipped: "email_notifications_disabled" });
  const { data: recipes } = await db.from("automation_recipes").select("recipe, days, enabled_at").eq("enabled", true);
  const due: Due[] = [];
  const today = localDate(now);

  const doneSteps = async (recipe: Recipe, ids: string[]) => {
    const counts = new Map<string, number>();
    if (!ids.length) return counts;
    const { data } = await db.from("automation_runs").select("subject_id, step").eq("recipe", recipe).in("subject_id", ids);
    for (const r of data ?? []) counts.set(r.subject_id, Math.max(counts.get(r.subject_id) ?? 0, r.step));
    return counts;
  };

  for (const r of recipes ?? []) {
    const enabledAt: string | null = r.enabled_at;
    if (!enabledAt) continue;
    const days: number[] = r.days ?? [];

    if (r.recipe === "quote_reminder") {
      const { data: quotes } = await db.from("project_quotes")
        .select("id, job_id, title, sent_at, valid_until, jobs!inner(ref, title, client_id, contact_email)")
        .eq("status", "sent").gte("sent_at", enabledAt);
      const open = (quotes ?? []).filter((q: any) => !q.valid_until || q.valid_until >= today);
      const counts = await doneSteps("quote_reminder", open.map((q: any) => q.id));
      for (const q of open as any[]) {
        const step = nextIntervalStep(q.sent_at, counts.get(q.id) ?? 0, days[0] ?? 3, MAX_STEPS, now);
        if (!step) continue;
        const job = q.jobs;
        const title = `${job.ref} · ${q.title || job.title}`;
        if (job.client_id) {
          due.push({ recipe: "quote_reminder", subjectId: q.id, step, label: title, toUserId: job.client_id,
            email: async () => quoteReminderEmail({ title, sentAt: q.sent_at, link: `${site}/projects/${q.job_id}` }) });
          continue;
        }
        // No portal login: email whoever the quote link went to, with a fresh link to the same quote.
        const { data: lastLink } = await db.from("quote_links").select("sent_to").eq("quote_id", q.id)
          .not("sent_to", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const to = lastLink?.sent_to || job.contact_email;
        if (!to) continue;
        due.push({ recipe: "quote_reminder", subjectId: q.id, step, label: title, to,
          email: async () => quoteReminderEmail({ title, sentAt: q.sent_at, link: `${site}/q/${await newQuoteLink(db, q, to)}` }) });
      }
    }

    if (r.recipe === "invoice_overdue") {
      // Only invoices that fall due after the switch was turned on.
      const { data: invoices } = await db.from("invoices")
        .select("id, invoice_number, total, currency, due_date, client_id")
        .in("status", ["sent", "overdue"]).is("client_marked_paid_at", null)
        .gte("due_date", localDate(new Date(enabledAt))).lt("due_date", today);
      const counts = await doneSteps("invoice_overdue", (invoices ?? []).map((i) => i.id));
      for (const inv of invoices ?? []) {
        const step = nextOverdueStep(inv.due_date!, counts.get(inv.id) ?? 0, days, today);
        if (!step || !inv.client_id) continue;
        const amount = `${inv.currency} ${Number(inv.total).toFixed(2)}`;
        due.push({ recipe: "invoice_overdue", subjectId: inv.id, step, label: `Invoice ${inv.invoice_number}`, toUserId: inv.client_id,
          email: async () => overdueInvoiceEmail({ number: inv.invoice_number, amount, dueDate: inv.due_date!, link: `${site}/invoices/${inv.id}` }) });
      }
    }

    if (r.recipe === "collection_reminder") {
      const { data: shipments } = await db.from("shipments")
        .select("id, job_id, notified_at, created_at, jobs!inner(ref, title, client_id)")
        .in("status", ["ready", "awaiting_client"]);
      const fresh = (shipments ?? []).filter((s: any) => s.jobs.client_id && (s.notified_at ?? s.created_at) >= enabledAt);
      const counts = await doneSteps("collection_reminder", fresh.map((s: any) => s.id));
      for (const s of fresh as any[]) {
        const step = nextIntervalStep(s.notified_at ?? s.created_at, counts.get(s.id) ?? 0, days[0] ?? 3, MAX_STEPS, now);
        if (!step) continue;
        const label = `${s.jobs.ref} · ${s.jobs.title}`;
        due.push({ recipe: "collection_reminder", subjectId: s.id, step, label, toUserId: s.jobs.client_id,
          email: async () => collectionReminderEmail({ label, link: `${site}/projects/${s.job_id}` }) });
      }
    }
  }

  const results = { sent: 0, failed: 0, skipped: 0 };
  for (const d of due.slice(0, MAX_SENDS_PER_RUN)) {
    // Claim first: if another run already took this step, the insert is ignored and we stop.
    const { data: claimed } = await db.from("automation_runs")
      .upsert({ recipe: d.recipe, subject_id: d.subjectId, step: d.step, label: d.label },
        { onConflict: "recipe,subject_id,step", ignoreDuplicates: true })
      .select("id");
    const runId = claimed?.[0]?.id;
    if (!runId) continue;
    // Earlier steps missed (paused, quiet hours, a gap in the cron) are recorded as skipped, not sent in a burst.
    const missed = Array.from({ length: d.step - 1 }, (_, i) => ({
      recipe: d.recipe, subject_id: d.subjectId, step: i + 1, label: d.label, status: "skipped",
      error: "Passed while not running", finished_at: new Date().toISOString(),
    }));
    if (missed.length) await db.from("automation_runs").upsert(missed, { onConflict: "recipe,subject_id,step", ignoreDuplicates: true });

    let status: "sent" | "failed" | "skipped" = "failed";
    let error: string | null = null;
    try {
      const { subject, html } = await d.email();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: d.to, to_user_id: d.toUserId, subject, html }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.skipped) { status = "skipped"; error = String(body.skipped); }
      else if (res.ok) status = "sent";
      else error = String(body?.error ?? `HTTP ${res.status}`).slice(0, 500);
    } catch (e) {
      error = String((e as Error)?.message ?? e).slice(0, 500);
    }
    await db.from("automation_runs").update({ status, error, finished_at: new Date().toISOString() }).eq("id", runId);
    results[status]++;
  }
  return json({ ok: true, ...results });
});

// Same shape as public.create_quote_link, but keeps the customer's earlier link working.
async function newQuoteLink(db: any, q: { id: string; valid_until: string | null }, sentTo: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const day = 86_400_000;
  const until = q.valid_until ? Date.parse(`${q.valid_until}T00:00:00Z`) + day : Date.now() + 30 * day;
  const { error } = await db.from("quote_links").insert({
    quote_id: q.id, token_hash: hash, sent_to: sentTo,
    expires_at: new Date(Math.max(until, Date.now() + day)).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}
