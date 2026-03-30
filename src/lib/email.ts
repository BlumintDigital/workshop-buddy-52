import { supabase } from "@/integrations/supabase/client";

/**
 * Send an email via the Supabase send-email Edge Function.
 * Fails silently — email is non-critical and should never block the caller.
 *
 * Setup:
 *   1. Create a Resend account at resend.com and get your API key
 *   2. supabase secrets set RESEND_API_KEY=your_key FROM_EMAIL=noreply@yourdomain.com
 *   3. supabase functions deploy send-email
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    await supabase.functions.invoke("send-email", {
      body: { to, subject, html },
    });
  } catch {
    // Non-critical — swallow errors
  }
}

// ── Email templates ──────────────────────────────────────────────

export function jobStatusEmailHtml(jobTitle: string, status: string, jobLink: string): string {
  const label = status.replace(/_/g, " ");
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Job status updated</h2>
  <p style="color:#555;margin:0 0 20px">Your job <strong>${jobTitle}</strong> has been updated to <strong>${label}</strong>.</p>
  <a href="${jobLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px">View job →</a>
</div>`;
}

export function quoteReadyEmailHtml(jobTitle: string, jobLink: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Quote ready for your review</h2>
  <p style="color:#555;margin:0 0 20px">A quote has been prepared for <strong>${jobTitle}</strong>. Please review and approve it at your convenience.</p>
  <a href="${jobLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px">Review quote →</a>
</div>`;
}

export function appointmentConfirmedEmailHtml(title: string, date: string, time: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Appointment confirmed</h2>
  <p style="color:#555;margin:0 0 6px"><strong>${title}</strong> has been confirmed.</p>
  <p style="color:#444;margin:0 0 20px">📅 ${date} at ${time}</p>
  <p style="color:#999;font-size:13px">If you need to reschedule, please contact us in advance.</p>
</div>`;
}

export function invoiceSentEmailHtml(invoiceNumber: string, total: number, currency: string, invoiceLink: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 8px">Invoice ${invoiceNumber}</h2>
  <p style="color:#555;margin:0 0 6px">An invoice for <strong>${currency} ${total.toFixed(2)}</strong> has been issued for you.</p>
  <a href="${invoiceLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px;margin-top:16px">View invoice →</a>
</div>`;
}
