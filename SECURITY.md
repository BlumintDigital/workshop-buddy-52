# Security Policy

## Reporting a Vulnerability

Email **security@example.com** with a description of the issue and steps to reproduce.

**Do not open a public GitHub issue for security vulnerabilities.**

We acknowledge reports within 48 hours and aim to remediate critical issues within 7 days.

## Supported Versions

Only the current production deployment at [your-domain.example.com](https://your-domain.example.com) receives security updates.

## Security Posture

- All database access is controlled by Supabase Row-Level Security (RLS) policies
- Authentication via Supabase Auth with optional TOTP multi-factor authentication
- MFA device trust tokens are stored in httpOnly cookies — not accessible to JavaScript
- Edge Functions validate JWTs on every request; no unauthenticated endpoints
- API keys, Resend credentials, and VAPID keys are stored as Supabase Edge Function Secrets — never in frontend code
- HTTPS enforced via HSTS (`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`)
- All data mutations are recorded in an immutable audit log via database triggers
- Role-based access: admin, manager, staff, client — with least-privilege enforcement

## Disclosure Timeline

| Day | Action |
|-----|--------|
| 0 | Report received |
| 1–2 | Acknowledgement sent, initial triage |
| 3–7 | Fix developed and tested (critical/high) |
| 7–14 | Fix deployed to production |
| 30+ | Public disclosure (coordinated with reporter) |
