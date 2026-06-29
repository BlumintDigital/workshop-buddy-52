import { supabase } from "@/integrations/supabase/client";

/**
 * Send an email via the send-email Edge Function (Resend).
 * Checks email_notifications_enabled before sending — callers don't need to check.
 * Fails silently — email is non-critical and should never block the caller.
 *
 * Pass either `to` (direct address) or `to_user_id` (looked up server-side from auth.users).
 */
export async function sendEmail(opts: {
  to?: string;
  to_user_id?: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    // The send-email edge function enforces the email_notifications_enabled
    // check server-side (config is admin-only and never exposed to the client).
    await supabase.functions.invoke("send-email", { body: opts });
  } catch {
    // Non-critical — swallow errors
  }
}

// ── Email templates ──────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

interface WrapperOpts {
  preheader: string;
  eyebrow: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnoteHtml?: string;
}

function wrapEmail(o: WrapperOpts): string {
  const cta = o.ctaUrl && o.ctaLabel
    ? `<tr><td align="center" style="padding:8px 0 4px">
         <a href="${o.ctaUrl}" style="display:inline-block;background:#3f6b52;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${o.ctaLabel}</a>
       </td></tr>
       <tr><td align="center" style="padding:10px 0 0;color:#94a3b8;font-size:12px;font-family:system-ui,sans-serif">
         If the button doesn't work, paste this link: <br/><a href="${o.ctaUrl}" style="color:#3f6b52;word-break:break-all">${o.ctaUrl}</a>
       </td></tr>`
    : "";
  const footnote = o.footnoteHtml
    ? `<tr><td style="padding:18px 0 0;border-top:1px solid #eef1ee;margin-top:24px;color:#64748b;font-size:13px;line-height:1.55;font-family:system-ui,sans-serif">${o.footnoteHtml}</td></tr>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f6f4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(o.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f4;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.06);overflow:hidden">
        <tr><td style="background:#3f6b52;padding:18px 28px;color:#ffffff;font-weight:600;font-size:14px;letter-spacing:.4px;text-transform:uppercase">Workshop Update</td></tr>
        <tr><td style="padding:32px 32px 28px">
          <div style="color:#3f6b52;font-size:12px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;margin-bottom:10px">${escapeHtml(o.eyebrow)}</div>
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a;font-weight:700">${escapeHtml(o.headline)}</h1>
          <div style="color:#475569;font-size:15px;line-height:1.6;margin-bottom:24px">${o.bodyHtml}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cta}${footnote}</table>
        </td></tr>
        <tr><td style="background:#fafbfa;padding:18px 28px;color:#94a3b8;font-size:12px;text-align:center;border-top:1px solid #eef1ee">This is an automated message from your workshop. Please do not reply.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function jobStatusEmailHtml(jobTitle: string, status: string, jobLink: string): string {
  const label = status.replace(/_/g, " ");
  return wrapEmail({
    preheader: `Your job "${jobTitle}" is now ${label}.`,
    eyebrow: "Job update",
    headline: "Your job status has been updated",
    bodyHtml: `Your job <strong>${escapeHtml(jobTitle)}</strong> is now marked as <strong style="color:#3f6b52">${escapeHtml(label)}</strong>. Open the portal to see the latest details and any attached files.`,
    ctaLabel: "View job in portal",
    ctaUrl: jobLink,
  });
}

export function quoteReadyEmailHtml(jobTitle: string, jobLink: string): string {
  return wrapEmail({
    preheader: `A quote is ready for "${jobTitle}".`,
    eyebrow: "Quote ready",
    headline: "Your quote is ready to review",
    bodyHtml: `We've prepared a quote for <strong>${escapeHtml(jobTitle)}</strong>. Review the line items in your portal and approve or request changes when you're ready.`,
    ctaLabel: "Review quote",
    ctaUrl: jobLink,
    footnoteHtml: `You can <strong>download a PDF copy</strong> from the quote page in the portal at any time.`,
  });
}

export function appointmentConfirmedEmailHtml(title: string, date: string, time: string): string {
  return wrapEmail({
    preheader: `Confirmed: ${title} on ${date} at ${time}.`,
    eyebrow: "Appointment confirmed",
    headline: "Your appointment is confirmed",
    bodyHtml: `<strong>${escapeHtml(title)}</strong> is locked in.<br/><br/>
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#f4f6f4;border-radius:10px;padding:14px 18px;margin-top:6px">
        <tr><td style="color:#3f6b52;font-size:13px;font-weight:600">📅 Date</td><td style="padding-left:18px;color:#0f172a;font-weight:500">${escapeHtml(date)}</td></tr>
        <tr><td style="color:#3f6b52;font-size:13px;font-weight:600;padding-top:6px">🕐 Time</td><td style="padding-left:18px;color:#0f172a;font-weight:500;padding-top:6px">${escapeHtml(time)}</td></tr>
      </table>`,
    footnoteHtml: `Need to reschedule? Please contact us at least 24 hours in advance.`,
  });
}

export function invoiceSentEmailHtml(invoiceNumber: string, total: number, currency: string, invoiceLink: string): string {
  const amount = `${escapeHtml(currency)} ${total.toFixed(2)}`;
  return wrapEmail({
    preheader: `Invoice ${invoiceNumber} for ${amount} is ready.`,
    eyebrow: `Invoice ${invoiceNumber}`,
    headline: "You have a new invoice",
    bodyHtml: `An invoice for <strong style="color:#0f172a;font-size:18px">${amount}</strong> has been issued for you. Open it in the portal to review the breakdown, settle payment, and download the PDF.`,
    ctaLabel: "View invoice in portal",
    ctaUrl: invoiceLink,
    footnoteHtml: `Inside the portal you can <strong>download a PDF copy</strong> of this invoice for your records.`,
  });
}

export function requestApprovedEmailHtml(requestTitle: string, jobLink: string): string {
  return wrapEmail({
    preheader: `Approved: "${requestTitle}" — we've opened a job.`,
    eyebrow: "Request approved",
    headline: "Good news — your request was approved",
    bodyHtml: `Your request <strong>${escapeHtml(requestTitle)}</strong> has been approved and we've opened a job to track the work. Follow progress, message us, and view related quotes or invoices right from the portal.`,
    ctaLabel: "View job in portal",
    ctaUrl: jobLink,
  });
}


// ── Auth email templates (for Supabase Dashboard → Auth → Email Templates) ──
// These are static HTML strings with Supabase template variables preserved as
// literal text (e.g. {{ .ConfirmationURL }}). Supabase substitutes them at send time.

function authEmailWrapper(
  workshopName: string,
  logoUrl: string | null,
  headline: string,
  body: string,
  ctaLabel: string,
  ctaUrl: string,
  footerNote: string,
): string {
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${workshopName}" style="height:64px;width:64px;border-radius:12px;object-fit:contain;display:block;margin:0 auto 12px" />`
    : `<div style="height:64px;width:64px;border-radius:12px;background:#0f172a;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px;line-height:64px;text-align:center">🔧</div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="background:#0f172a;padding:28px 32px;text-align:center">
    ${logoBlock}
    <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0;letter-spacing:-.01em">${workshopName}</h1>
  </div>
  <div style="padding:36px 32px">
    <h2 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 12px">${headline}</h2>
    <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 28px">${body}</p>
    <a href="${ctaUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${ctaLabel}</a>
    <p style="color:#999;font-size:12px;margin:28px 0 0;line-height:1.5">${footerNote}</p>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
    <p style="color:#94a3b8;font-size:12px;margin:0">&copy; ${new Date().getFullYear()} ${workshopName}. All rights reserved.</p>
  </div>
</div>
</body></html>`;
}

export function authConfirmSignupEmailHtml(workshopName: string, logoUrl: string | null): string {
  return authEmailWrapper(
    workshopName, logoUrl,
    "Verify your email address",
    "Thanks for signing up! Click the button below to confirm your email address and activate your account.",
    "Confirm Email →",
    "{{ .ConfirmationURL }}",
    "If you didn't create an account with " + workshopName + ", you can safely ignore this email.",
  );
}

export function authResetPasswordEmailHtml(workshopName: string, logoUrl: string | null): string {
  return authEmailWrapper(
    workshopName, logoUrl,
    "Reset your password",
    "We received a request to reset the password for your account. Click the button below to choose a new password. This link expires in 1 hour.",
    "Reset Password →",
    "{{ .ConfirmationURL }}",
    "If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.",
  );
}

export function authMagicLinkEmailHtml(workshopName: string, logoUrl: string | null): string {
  return authEmailWrapper(
    workshopName, logoUrl,
    "Your sign-in link",
    "Click the button below to sign in to your account. This link is valid for 1 hour and can only be used once.",
    "Sign In →",
    "{{ .ConfirmationURL }}",
    "If you didn't request this link, you can safely ignore this email.",
  );
}

export function authChangeEmailEmailHtml(workshopName: string, logoUrl: string | null): string {
  return authEmailWrapper(
    workshopName, logoUrl,
    "Confirm your new email address",
    "We received a request to change the email address on your account. Click the button below to confirm your new email address.",
    "Confirm New Email →",
    "{{ .ConfirmationURL }}",
    "If you didn't request an email change, please contact support immediately.",
  );
}

export function authInviteUserEmailHtml(workshopName: string, logoUrl: string | null): string {
  return authEmailWrapper(
    workshopName, logoUrl,
    "You've been invited",
    `You've been invited to join <strong>${workshopName}</strong>. Click the button below to set up your account and get started.`,
    "Accept Invitation →",
    "{{ .InvitationURL }}",
    "If you weren't expecting an invitation, you can safely ignore this email.",
  );
}

export function bugReportEmailHtml(
  submitterName: string,
  severity: string,
  title: string,
  description: string,
  pageUrl: string,
  feedbackLink: string,
): string {
  const severityColor = severity === "high" ? "#dc2626" : severity === "medium" ? "#d97706" : "#16a34a";
  const severityBg = severity === "high" ? "#fef2f2" : severity === "medium" ? "#fffbeb" : "#f0fdf4";
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fff">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 4px">New Issue Report</h2>
  <p style="color:#888;font-size:13px;margin:0 0 20px">Submitted by <strong style="color:#333">${submitterName}</strong></p>
  <span style="display:inline-block;background:${severityBg};color:${severityColor};border:1px solid ${severityColor}40;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px">${severity} severity</span>
  <h3 style="font-size:16px;font-weight:600;margin:0 0 8px;color:#111">${title}</h3>
  <p style="color:#555;margin:0 0 20px;white-space:pre-wrap;line-height:1.6">${description}</p>
  ${pageUrl ? `<p style="color:#999;font-size:13px;margin:0 0 24px">📍 Reported on: <span style="color:#555">${pageUrl}</span></p>` : ""}
  <a href="${feedbackLink}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:500;font-size:14px">View report →</a>
</div>`;
}
