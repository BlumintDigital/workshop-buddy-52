# Vendor Risk Assessment

**Owner:** Your Organization
**Last reviewed:** June 2026
**Review cadence:** Annually, or when a vendor makes material changes to their terms or infrastructure

---

## Scope

This document assesses the security and compliance posture of third-party vendors that process Workshop Manager customer data.

---

## Vendor Inventory

### 1. Supabase
**Role:** Backend infrastructure — PostgreSQL database, authentication, edge functions, file storage

| Attribute | Detail |
|-----------|--------|
| Data processed | All customer data (profiles, jobs, invoices, appointments, activity logs) |
| Data location | AWS eu-west-2 (London) by default — verify in project settings |
| Certifications | SOC2 Type II ✅ |
| DPA available | Yes — Supabase DPA at supabase.com/legal/dpa |
| Encryption at rest | AES-256 |
| Encryption in transit | TLS 1.2+ |
| Sub-processors | AWS (storage/compute), Fly.io (edge functions) |
| Incident notification | 72-hour notification commitment per their terms |
| Status page | status.supabase.com |
| Risk level | **Medium** — hosts all production data; mitigated by SOC2 cert and RLS enforcement |

**Controls in place:**
- Row-Level Security (RLS) on all tables — even if Supabase is compromised at the infrastructure level, application-level access controls remain
- Service role key is never in frontend code
- PITR (Point-in-Time Recovery) enabled (verify on Pro plan)

---

### 2. Vercel
**Role:** Frontend hosting — serves the React/Vite web application

| Attribute | Detail |
|-----------|--------|
| Data processed | No personal data stored; serves static files and logs HTTP access (IP, user agent) |
| Data location | Global edge network; logs may traverse multiple regions |
| Certifications | SOC2 Type II ✅ |
| DPA available | Yes — vercel.com/legal/dpa |
| Encryption in transit | TLS 1.3 with HSTS enforced |
| Status page | vercel-status.com |
| Risk level | **Low** — no personal data stored; access logs are transient |

**Controls in place:**
- HSTS header (`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`) forces HTTPS
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- Environment variables (Sentry DSN, Supabase URL) are not secret — no sensitive keys stored in Vercel

---

### 3. Resend
**Role:** Transactional email delivery — sends bug reports, notifications, auth emails

| Attribute | Detail |
|-----------|--------|
| Data processed | Email addresses, email content (job status, invoice notifications, bug reports) |
| Data location | USA (AWS us-east-1) |
| Certifications | SOC2 Type II (in progress as of 2025 — verify current status at resend.com/security) |
| DPA available | Yes — resend.com/legal/dpa |
| EU-US data transfer | Standard Contractual Clauses (SCCs) |
| Encryption in transit | TLS |
| Status page | resend-status.com |
| Risk level | **Medium** — processes email addresses and business content; limited retention |

**Controls in place:**
- Resend API key stored as a Supabase Edge Function secret (never in frontend or version control)
- Only sends from verified domain (`your-verified-domain.com`) — prevents sender spoofing
- Email content is sanitised (HTML stripped) before sending bug reports

---

### 4. Sentry (optional)
**Role:** Error monitoring — captures frontend JavaScript exceptions

| Attribute | Detail |
|-----------|--------|
| Data processed | Error stack traces, browser info; **no email addresses** (stripped via `beforeSend`) |
| Data location | USA (sentry.io cloud) or self-hosted |
| Certifications | SOC2 Type II ✅ |
| DPA available | Yes — sentry.io/legal/dpa |
| EU-US data transfer | Standard Contractual Clauses (SCCs) |
| Risk level | **Low** — PII is stripped before events are sent |

**Controls in place:**
- `beforeSend` hook removes `event.user.email` before transmission
- Only enabled when `VITE_SENTRY_DSN` env var is set
- Sentry data retention set to 90 days

---

## Risk Register

| Vendor | Risk | Likelihood | Impact | Mitigation |
|--------|------|-----------|--------|-----------|
| Supabase | Data breach of hosted DB | Low | High | RLS, MFA, least-privilege service role |
| Supabase | Service outage | Low | High | Supabase HA; local caching; status page monitoring |
| Vercel | CDN outage | Low | Medium | Vercel 99.99% SLA; global edge |
| Resend | Email deliverability issue | Medium | Low | Verified domain; bounce monitoring; fallback: direct SMTP |
| Any vendor | Change to DPA/terms without notice | Low | Medium | Annual review of vendor terms |

---

## Annual Review Checklist

- [ ] Verify Supabase SOC2 certificate is current (supabase.com/security)
- [ ] Verify Vercel SOC2 certificate is current
- [ ] Confirm Resend SOC2 status
- [ ] Review any sub-processor changes announced by Supabase or Vercel
- [ ] Check that DPAs are signed and on file
- [ ] Verify PITR is enabled on the Supabase project
- [ ] Confirm backup retention period meets our `data-retention.md` requirements
- [ ] Update this document with any material changes
