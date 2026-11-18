// The look shared by every workshop email: the app's templates (src/lib/email.ts) and the
// server's automatic reminders. No imports, so both Vite and Deno can load it.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export interface WrapperOpts {
  preheader: string;
  eyebrow: string;
  headline: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnoteHtml?: string;
}

export function wrapEmail(o: WrapperOpts): string {
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
