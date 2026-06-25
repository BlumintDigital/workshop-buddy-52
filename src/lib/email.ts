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
