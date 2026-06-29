# Production Readiness Audit — Workshop Buddy

**Date:** 28 June 2026
**Scope:** Security & RLS, Performance & scalability, Reliability & ops, Code quality & UX
**Method:** Lovable security scanners, Supabase DB linter, `pg_stat_statements`, static review of the repo (73 migrations, 20 edge functions, frontend + CI + hosting config).
**Status:** Sprint 1 partially landed (28 Jun 2026) — see § 9 below.

---

## 1. Executive summary

Workshop Buddy is in **good shape for a limited production rollout**. The codebase shows a mature security posture (RLS on every public table, role separation via `user_roles` + `has_role()`, MFA with backup codes and trusted devices, rate-limiting helper shared across edge functions, sanitised email, server-side VAPID key) and a credible operational baseline (CI on every PR, Sentry with PII scrubbing, security/incident/vendor/retention runbooks, automated migrations via `supabase db push`).

The blockers before opening the doors to untrusted, scaling traffic are concentrated in three places:

1. **TypeScript `strict: false`** across the project, hiding a class of nullable/typing bugs that will surface under load.
2. **Hot-path reads not cached on the client** — `workshop_settings` and `user_roles` are re-fetched per page navigation, dominating the slow-query list.
3. **No e2e tests, no edge-function tests, no RLS regression tests** in CI; unit coverage is limited to 7 files.

None of these are show-stoppers; all are addressable in a sprint.

| Area | Verdict |
|------|---------|
| Security & RLS posture | ✅ Ready (with 3 housekeeping items) |
| Performance & scalability | ⚠️ Needs work (caching + lazy-load review) |
| Reliability & operations | ⚠️ Needs work (test depth + PITR confirmation) |
| Code quality & UX | ⚠️ Needs work (strict mode off, thin tests) |

---

## 2. Security & RLS posture

### 2.1 Lovable security scanners

All five scanners report **0 open findings**:

- `agent_security`, `connector_security_scan`, `supabase`, `supabase_lov`, `supply_chain` — all clean as of the latest scan.

This reflects the steady stream of remediation migrations (`20260624…` series) that closed dozens of findings: VAPID private key moved server-side, AAL2-restrictive policies for admin/manager tables, `is_super_admin` self-write blocked, manager role-escalation paths closed, bucket-listing locked down, SECURITY DEFINER `EXECUTE` revoked from `anon/PUBLIC`, etc.

### 2.2 Supabase database linter — 10 findings

| # | Level | Rule | Recommendation |
|---|-------|------|----------------|
| 1 | ERROR | `0010_security_definer_view` — a view runs with creator's privileges | Identify the view (likely an analytics or reporting helper). Either rewrite as a regular view + RLS-scoped function, or document and accept it in `security-memory` if it intentionally exposes aggregates. |
| 2–9 | WARN | `0029_authenticated_security_definer_function_executable` — 8 SECURITY DEFINER functions are EXECUTE-able by `authenticated` | Audit each: the analytics RPCs (`get_monthly_revenue`, `get_monthly_bookings`, `get_job_completion_stats`) already check `has_role(...,'admin')` internally — accept these. For the trigger functions (`set_updated_at`, `log_activity`, `rls_auto_enable`, `signup_codes_set_updated_at`, `create_invoice_on_job_completed`, `admin_onboarding_progress_set_updated_at`), revoke `EXECUTE` from `authenticated` and `PUBLIC` so they can only run as triggers. `handle_new_user` likewise. |
| 10 | WARN | Leaked-password protection disabled in Auth | Enable in Supabase Dashboard → Authentication → Policies → "Leaked password protection". Free, instant, no code. |

### 2.3 RLS coverage

Every table in `public` has RLS enabled with at least one policy. Policy counts range from 1 (system tables like `feature_flags`, `mfa_backup_codes`) to 8 (`appointments`, `activity_logs`). Sensitive tables verified:

- `profiles` — 6 policies, phone/address restricted to admin per recent migration.
- `user_roles` — 7 policies, manager role-escalation paths closed (`signup_codes_manager_can_create_manager_role_codes`, `managers_can_update_roles_no_new_role_check`).
- `workshop_admin_contacts` — 2 policies, admin-only (created to take VAPID/super-admin email out of `workshop_settings`).
- `mfa_*` — restrictive AAL2 policies for admin/manager.
- `activity_logs` — writes blocked from the client; only triggers + service role write.
- `signup_codes` — INSERT/UPDATE `WITH CHECK` restricts managers to creating `staff`/`client` codes only.

**No anon-writable tables.** `dismissed_notices` and `dismissed_broadcasts` correctly grant SELECT+INSERT to `authenticated` only.

### 2.4 Edge functions (20 functions)

Pattern checks across all functions:

- ✅ JWT validated via `getClaims()` before any privileged work.
- ✅ Service role key never sent to or accepted from the client; only read from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- ✅ CORS bound to `ALLOWED_ORIGIN` (or `ALLOWED_ORIGINS`) — no `*`.
- ✅ Rate-limit helper (`_shared/rate-limit.ts`) applied to abuse-prone endpoints: `backup-data`, `mfa-backup-generate`, `mfa-backup-verify`, `mfa-trust-device`, `admin-resend-invite`.
- ⚠️ `send-push` and `send-email` should be double-checked for per-user rate limits — a compromised admin token could be used to spam.
- ⚠️ `admin-api` is the super-admin surface and depends on `GLOBAL_ADMIN_SECRET`. Confirm it's rotated on the schedule defined in the incident runbook.

### 2.5 Secrets & transport

- Secrets present and named correctly: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `GLOBAL_ADMIN_SECRET`, `ALLOWED_ORIGINS`, `FROM_EMAIL`, `SUPABASE_JWKS`. `VAPID_PUBLIC_KEY` is also stored (intentional — exposed to clients).
- `vercel.json` enforces HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. SW header is `no-cache, no-store, must-revalidate`.
- **Missing:** no `Content-Security-Policy`. Recommend adding a report-only CSP first, then enforcing once Sentry/Supabase domains are listed.

### 2.6 Auth hygiene

- MFA (TOTP) with backup codes and 30-day trusted-device cookies (httpOnly via edge function).
- Signup code system blocks anonymous self-signup spam.
- Password reset and email confirmation flows are present.
- Recent `auth-session-handling` work eliminated the flicker / auth-flash regression.

---

## 3. Performance & scalability

### 3.1 Slow queries (pg_stat_statements, top 7)

| # | Calls | Total ms | Mean ms | Query |
|---|-------|---------:|--------:|-------|
| 1 | 790 | 11 717 | 14.83 | `workshop_settings` by id (workshop_name, logo_url) |
| 2 | 271 | 3 813 | 14.07 | `user_roles` by user_id |
| 3 | 829 | 3 735 | 4.51 | `broadcasts` ORDER BY created_at DESC |
| 4 | 225 | 3 015 | 13.40 | `activity_logs` ORDER BY created_at DESC |
| 5 | 830 | 2 801 | 3.37 | `system_notices` ORDER BY created_at DESC |
| 6 | 222 | 2 380 | 10.72 | `workshop_settings.feature_flags` by id |
| 7 | 788 | 1 998 | 2.54 | `notifications` by user_id |

**Findings:**

- Reads 1, 2, 6 are per-session data and should be cached in React Query with a `staleTime` of 5–10 min instead of re-fetched per route. Single biggest win.
- Reads 3 and 5 (`broadcasts`, `system_notices`) are polled banners — combine into one RPC or cache on session boot, refresh on focus.
- Read 4 (`activity_logs`) — add an index `(created_at DESC)` if not present; the timeline page is already paginated, confirm it requests only the first page.
- Read 7 — `notifications(user_id, created_at DESC)` composite index recommended.

### 3.2 Bundle

- `vite.config.ts` splits vendors cleanly (`vendor-pdf`, `vendor-charts`, `vendor-supabase`, `vendor-radix`, `vendor-router`, `vendor-react`, `vendor-icons`, `vendor-remotion`).
- `src/App.tsx` uses `lazy()` 43 times — every route is code-split. ✅
- Heavy deps to watch: `@react-pdf/renderer`, `recharts`, `remotion`, `@remotion/player`. Verify Remotion is actually used in production — if it's only goal animations, gate behind the `goals` feature flag.
- `chunkSizeWarningLimit: 1000` may be hiding a chunk that should be split — run `vite build` and inspect output.

### 3.3 PWA & service workers

- `sw.ts` registers `NetworkOnly` for navigations before `precacheAndRoute` — correct ordering, prevents stale index.html after deploys. ✅
- `push-sw.js` is a second worker. Verify scopes don't overlap (one should be scoped narrower, or push handling should be merged into `sw.ts` which already has `push` + `notificationclick` handlers — there is potential duplication).
- Offline fallback to `/offline.html` is wired.

### 3.4 Realtime

- No `supabase.channel(...)` subscriptions found in the frontend source tree. If realtime is needed (e.g. job board updates, notifications), this is currently driven by polling (`ActivityFeed` polls every 15–20s, focus refresh). This is fine for current scale but capped at ~3000 req/min per active admin.

### 3.5 Sizing

Current daily volume (from `pg_stat_statements` totals over the observation window) is well within a Supabase Pro instance. Recommend Pro plan for PITR and resource headroom before opening to >5 concurrent workshops.

---

## 4. Reliability & operations

### 4.1 CI/CD

`.github/workflows/ci.yml` runs on push/PR to `main`:

- ✅ `tsc --noEmit`
- ✅ `npm run lint`
- ✅ `npm run test` (vitest)

`deploy-functions.yml` exists for edge function deploys.

**Gaps:**

- ❌ No `npm run build` job — type-check passes but a real Vite build can still fail (e.g. circular imports, missing assets).
- ❌ Playwright is installed and configured but not executed in CI.
- ❌ No migration linting or dry-run (`supabase db diff`).
- ❌ No deploy preview gate (Vercel preview is automatic, but no smoke check).

### 4.2 Migrations

- 73 migration files; `schema.sql` retired in favour of `supabase db push`.
- Deploy guide (`docs/deploy-new-customer.md`) documents the new flow.
- Recommend tagging each prod deploy with the highest migration applied, and storing the `supabase migration list` output in the release notes.

### 4.3 Backups & DR

- `backup-data` and `restore-data` edge functions exist, admin-only, rate-limited (5/hour), checksum + manifest.
- Supabase PITR — `docs/vendor-risk.md` flags "verify on Pro plan." **Action: confirm PITR is enabled and document recovery target time/point objectives.**
- No automated off-Supabase backup. For a paying-customer workload, schedule a weekly `backup-data` call to a separate object store.

### 4.4 Monitoring

- ✅ Sentry on the frontend with `beforeSend` PII scrub.
- ⚠️ No structured error monitoring on edge functions beyond Supabase logs. Consider piping `console.error` from functions to Sentry via the `@sentry/deno` SDK.
- ❌ No external uptime check on the public URL or a health endpoint.

### 4.5 Runbooks

`SECURITY.md`, `docs/incident-response.md`, `docs/vendor-risk.md`, `docs/data-retention.md`, `docs/deploy-new-customer.md`, `docs/user-guide.md` are all present and recently maintained. **This is best-in-class for an app of this size.**

### 4.6 Email

- Resend with verified `shoplane.uk` sender domain.
- HTML stripped on bug reports.
- 60s cooldown on `admin-resend-invite`.

---

## 5. Code quality & UX

### 5.1 TypeScript

`tsconfig.app.json` and `tsconfig.json`:

```
strict: false
strictNullChecks: false
noImplicitAny: false
noUnusedLocals: false
noUnusedParameters: false
```

**This is the single biggest code-quality risk.** With strict null checks off, the compiler will not catch the most common runtime crashes (reading properties of undefined, missing branches on nullable rows from Supabase). Recommend a phased migration: enable `strictNullChecks` first, fix the new errors, then `strict: true`.

ESLint v9 + typescript-eslint configured; runs in CI.

### 5.2 Tests

| Layer | Coverage |
|-------|----------|
| Unit (vitest) | 7 files: `useAuth`, schemas, branding, feature flags, admin onboarding, setup, example |
| Integration | None |
| RLS / policy regression | None — recommend pgTAP or dedicated SQL tests run in CI against a throwaway db |
| Edge functions (Deno test) | None — `supabase test edge-functions` infrastructure available, unused |
| E2E (Playwright) | Configured, no specs visible in `src/test/` |

For a multi-tenant security-sensitive app this is the largest reliability gap. Recommend, in priority order:
1. Playwright smoke for sign-in → MFA → dashboard, per role.
2. RLS regression tests for `profiles`, `user_roles`, `signup_codes`, `invoices`, `workshop_admin_contacts`.
3. Deno tests for `mfa-backup-verify`, `mfa-trust-device`, `admin-create-user`, `validate-signup-code`.

### 5.3 Accessibility / UX

- shadcn/ui + Radix primitives — accessible by default.
- Recent mobile work standardised header actions (`PageActions`) and list/card swap on small screens.
- `ProtectedRoute` handles missing role and MFA states gracefully.
- `FeatureUnavailable` page provides a clean fallback for disabled features.
- Toasts via `sonner`, dialogs via `AlertDialog` for destructive actions (revoke device, etc.).

Spot-check items not verified in this audit: keyboard navigation on the kanban board, focus return after dialog dismissal, colour-contrast for the dynamic-brand theme tokens.

### 5.4 Error handling

- Sentry catches frontend exceptions.
- Supabase errors surfaced via toasts in most mutation paths.
- Optimistic UI rollback added on banner dismissal (recent fix).

---

## 6. Risk register

| Risk | Likelihood | Impact | Owner | Recommended action |
|------|:---:|:---:|------|--------------------|
| Runtime null-deref crash in a critical flow | High | Medium | Eng | Enable `strictNullChecks`, fix surfaced errors |
| Stale RLS regression after migration | Medium | High | Eng | Add pgTAP RLS tests to CI |
| Hot reads overwhelm Supabase at 10× load | Medium | Medium | Eng | Cache `workshop_settings`, `user_roles` in React Query |
| Leaked password reused on another site | Medium | High | Ops | Enable leaked-password protection in Auth dashboard |
| Lost data without PITR | Low | Critical | Ops | Confirm Supabase Pro + PITR enabled |
| Edge-function silent failure | Medium | Medium | Ops | Wire `@sentry/deno` into shared util |
| Spam push/email from compromised admin token | Low | Medium | Eng | Add per-user rate limits to `send-push`/`send-email` |
| CSP-less XSS escalation | Low | High | Eng | Add report-only CSP, then enforce |

---

## 7. Prioritised action list

### P0 — before opening to non-trusted traffic
1. Enable **leaked-password protection** in Supabase Auth (Dashboard toggle, 1 minute).
2. Confirm **Supabase Pro + PITR** is enabled; document RTO/RPO.
3. Revoke `EXECUTE` on the 6 trigger-only SECURITY DEFINER functions; resolve or accept the 1 SECURITY DEFINER view (linter rule 0010).
4. Add **`npm run build`** to CI.

### P1 — this sprint
5. Cache `workshop_settings` and `user_roles` via React Query with a 5–10 min `staleTime`.
6. Enable TypeScript `strictNullChecks`, then `strict: true`; fix surfaced errors.
7. Add Playwright smoke tests for the 4 role sign-in flows; run in CI on PR.
8. Add at least one pgTAP-style RLS regression test per sensitive table.
9. Add per-user rate limits to `send-push` and `send-email`.
10. Add an uptime monitor (BetterUptime/UptimeRobot) on `https://ieq.shoplane.uk`.

### P2 — backlog
11. Add report-only CSP, evolve to enforced.
12. Pipe edge-function errors to Sentry (`@sentry/deno`).
13. Composite indexes: `notifications(user_id, created_at DESC)`, `activity_logs(created_at DESC)`.
14. Merge `push-sw.js` and `sw.ts` to avoid scope overlap.
15. Schedule weekly off-Supabase backup via `backup-data` to S3/R2.
16. Audit Remotion usage — gate or remove if unused in production.

---

## 8. Appendix

### 8.1 Edge function inventory (20)

`admin-access-review`, `admin-api`, `admin-create-user`, `admin-delete-user`, `admin-resend-invite`, `admin-toggle-user`, `backup-data`, `create-client`, `delete-data`, `mfa-backup-generate`, `mfa-backup-verify`, `mfa-check-device`, `mfa-trust-device`, `restore-data`, `seed-data`, `send-email`, `send-push`, `setup-demo`, `validate-signup-code`, plus `_shared` (cors, rate-limit).

### 8.2 Notable dependency versions

`@supabase/supabase-js 2.108.2`, `react-router-dom 7.x`, `recharts 3.9.0`, `@sentry/react 10.61.0`, `react 18.3.1`, `vite 5.4.19`, `typescript 5.8.3`, `zod 3.25.76`, `@react-pdf/renderer 4.3.2`, `remotion 4.0.446`.

### 8.3 Supabase linter raw output

```
ERROR  0010_security_definer_view (×1)
WARN   0029_authenticated_security_definer_function_executable (×8)
WARN   auth_leaked_password_protection (×1)
```

### 8.4 Scanner status

| Scanner | Findings | Last run |
|---------|---------:|----------|
| agent_security | 0 | 2026-06-28 |
| connector_security_scan | 0 | 2026-06-28 |
| supabase | 0 | 2026-06-28 |
| supabase_lov | 0 | 2026-06-28 |
| supply_chain | 0 | 2026-06-24 |

---

## 9. Remediation log

### Shipped 28 Jun 2026 (Sprint 1, partial)

- **Perf 1.1** — React Query global defaults set (`staleTime: 5 min`, `gcTime: 30 min`, `refetchOnWindowFocus: false`). Reduces redundant `workshop_settings` / `user_roles` re-fetching across route transitions.
- **Perf 1.3** — Indexes added: `notifications(user_id, created_at DESC)`, `activity_logs(created_at DESC)`, `broadcasts(created_at DESC)`, `system_notices(created_at DESC)`.
- **Perf 1.4** — `chunkSizeWarningLimit` lowered from 1000 → 700 so regressions surface earlier.
- **Reliability 2.1** — CI gained a `build` job running `npm run build` with placeholder env vars.
- **Reliability 2.6** — Per-user rate limits applied to `send-push` (30/hr) and `send-email` (60/hr) via the shared rate-limit helper (with 15 min lockout and `Retry-After` header).
- **Reliability 2.7** — `docs/uptime.md` runbook added (target 99.9%, BetterUptime / UptimeRobot, root URL + Supabase auth health URL).
- **Quality 3.3** — Two new unit test files (`currency.test.ts`, `emailSanitize.test.ts`); suite now 8 files / 48 tests.
- **Quality 3.5** — `Content-Security-Policy-Report-Only` header added in `vercel.json`; review violation reports before flipping to enforced.

### Still open (next sprints)

- Perf 1.1 cont. — replace ad-hoc `workshop_settings` / `user_roles` reads in `useAuth`, `AppSidebar`, `AppHeader`, `useFeatureFlags`, branding with shared cached hooks.
- Perf 1.2 — consolidate `broadcasts` + `system_notices` polling into a single `useNotices()` query.
- Perf 1.5 — fold `push-sw.js` into `src/sw.ts`.
- Reliability 2.2 — Playwright per-role smoke tests + CI job.
- Reliability 2.3 — pgTAP RLS regression suite.
- Reliability 2.4 — Deno tests for MFA / admin edge functions.
- Reliability 2.5 — `@sentry/deno` wrapper in `_shared/`.
- Quality 3.1 — phased TypeScript strictness (`strictNullChecks` → `strict`).
- Quality 3.2 — re-enable `no-unused-vars`, add `jsx-a11y`.
- Quality 3.4 — keyboard a11y pass on `StaffKanban` + axe-core in e2e.
- Quality 3.5 cont. — flip CSP from Report-Only to enforced after 1 week of clean reports.

---

*End of audit.*


### Shipped 29 Jun 2026 (Sprint 2)

- **Perf 1.5** — `push-sw.js` collapsed into the main `/sw.js`; the legacy file is now a self-unregistering stub for returning users.
- **Reliability 2.3** — pgTAP RLS spec scaffolded in `supabase/tests/rls/` (profiles, user_roles, signup_codes) with a non-blocking `rls-tests` CI job.
- **Reliability 2.5** — `_shared/sentry.ts` helper added and wired into 5 high-impact edge functions (`send-push`, `validate-signup-code`, `admin-create-user`, `backup-data`, `restore-data`). Set `SENTRY_DSN` in the Supabase function secrets to activate.
- **Quality 3.1** — phase A complete: `strictNullChecks: true` enabled in `tsconfig.json` and `tsconfig.app.json`. All resulting nullability errors fixed (JobStatusChart, useAuth profile type, Auth.tsx factorId, AdminSettings demo seed, GoalsAnimations dot array, JobDetail filter/id).

### Still open (Sprint 3+)

- Perf 1.1 cont., Perf 1.2 — cached shared hooks for settings/roles, notices polling consolidation.
- Reliability 2.2 — Playwright per-role smoke tests + CI job.
- Reliability 2.4 — Deno tests for MFA / admin edge functions.
- Reliability 2.5 cont. — extend Sentry to remaining edge functions; add release tagging.
- Quality 3.1 cont. — phase B: enable `strict: true` and `noImplicitAny`.
- Quality 3.2, 3.4 — lint hardening, a11y pass + axe-core in e2e.
- Quality 3.5 cont. — flip CSP from Report-Only to enforced after 1 week of clean reports.
