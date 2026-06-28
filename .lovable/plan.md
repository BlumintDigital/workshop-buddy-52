# Production Readiness Audit — Workshop Buddy

Report-only. No code changes. Deliverable: `docs/production-audit.md` committed to the repo plus a chat summary covering the same findings.

## Scope

Audit the current state of the app across four areas and rate production readiness per area (Ready / Needs work / Blocker):

1. Security & RLS posture
2. Performance & scalability
3. Reliability & operations
4. Code quality & UX

The audit reflects what is in the repo and Supabase project today — no fixes are applied in this round.

## Method

Already gathered while preparing this plan:

- Lovable security scanners (agent, connector, supabase, supabase_lov, supply_chain): **0 open findings**.
- Supabase DB linter: 1 ERROR (Security Definer View), 8 WARN (SECURITY DEFINER functions executable by authenticated role), 1 WARN (leaked-password protection disabled in Auth).
- `pg_stat_statements` top queries: `workshop_settings` lookup by id is the hottest read (790 calls, ~11.7s total); `user_roles` by user_id, `broadcasts`, `system_notices`, `activity_logs`, and `notifications` round out the top 7.
- Repo signals: 73 migrations, 20 edge functions, CI workflow runs typecheck + lint + tests, 7 vitest files, Playwright config present, Sentry wired (`@sentry/react`), PWA via `vite-plugin-pwa` with network-only navigation + offline fallback, Vercel hosting with HSTS + security headers, MFA + trusted-device + backup-code flows, rate-limit helper shared across edge functions, dual auth (Supabase) with role-table pattern using `has_role()` security-definer to avoid RLS recursion.

For the final report I will additionally:

- Skim every edge function for: JWT validation, CORS origin scoping, service-role usage, rate limits, input validation.
- Spot-check RLS on the highest-risk tables (`profiles`, `user_roles`, `signup_codes`, `workshop_settings`, `workshop_admin_contacts`, `invoices`, `mfa_*`, `push_subscriptions`, `activity_logs`).
- Cross-reference open Supabase linter findings against the security memory to flag any that are not yet documented as accepted.
- Read `vite.config.ts` chunking, `vercel.json` headers, and `sw.ts` for caching/PWA risks.
- Inventory tests (coverage of auth, RLS-sensitive flows, MFA) and note gaps.

## Deliverable structure

`docs/production-audit.md` will contain:

1. **Executive summary** — one-paragraph verdict + per-area Ready/Needs work/Blocker table.
2. **Security & RLS posture**
   - Auth model (Supabase Auth + roles via `user_roles` + `has_role`), MFA + trusted devices + backup codes.
   - RLS coverage by table, called out: tables with `anon` grants, tables with sensitive PII, AAL2-restricted tables.
   - Edge function review (per-function: auth check, CORS, rate limit, service-role scope).
   - Supabase linter findings reproduced verbatim with a recommendation per item (notably: enable leaked-password protection in Auth dashboard; audit the SECURITY DEFINER view and revoke `EXECUTE` on definer functions not meant for client calls).
   - Secrets handling (VAPID private key server-side, Resend, GLOBAL_ADMIN_SECRET, ALLOWED_ORIGINS).
   - Headers and transport (HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy from `vercel.json`).
3. **Performance & scalability**
   - Slow-query top 10 with proposed indexes / caching (e.g. cache `workshop_settings` and `user_roles` per session; current 790-call read pattern suggests no client-side memoization for the hot path).
   - Bundle: manualChunks splits PDF, charts, supabase, radix, router, react, icons — good. Note `@react-pdf/renderer` + `recharts` + `remotion` are heavy; verify they are lazy-loaded by route.
   - PWA: network-only for navigations is correct post-deploy; verify `push-sw.js` does not conflict with workbox SW scope.
   - Realtime: spot-check for unscoped channels or component-scope subscriptions.
   - Supabase plan sizing recommendation based on query volume.
4. **Reliability & operations**
   - CI: typecheck + lint + unit tests on push/PR — present. Missing: build step, e2e (Playwright is configured but not in CI), preview deploy gates, migration dry-run.
   - Migrations: 73 files, deploy guide switched to `supabase db push`. Confirm CI does not auto-push to prod; document who runs migrations.
   - Backups: `backup-data` / `restore-data` edge functions exist (admin-only, rate-limited). Verify Supabase PITR is enabled (vendor-risk doc says "verify on Pro plan" — flag as action item).
   - Monitoring: Sentry wired in frontend with PII scrubbing; no backend error monitoring on edge functions beyond Supabase logs. Recommend uptime monitor on a public health endpoint.
   - Incident response runbook + vendor risk + data retention + SECURITY.md are all present — strong.
   - Email: Resend with verified domain, sanitized HTML — good.
5. **Code quality & UX**
   - TypeScript strictness (read `tsconfig.app.json`), ESLint config status, dead-code / `any` hotspots.
   - Test coverage: 7 vitest files (auth, schemas, branding, feature flags, admin onboarding, example). Gaps: invoice flow, RLS policies (pgTAP), edge-function unit tests, MFA flows, push subscription.
   - Accessibility quick check: semantic HTML on auth + dashboard, focus management on dialogs, keyboard handling on kanban.
   - Mobile: known recent work on responsive headers and action toolbars; verify all admin pages with `PageActions` and card-mode lists.
   - Error handling: `ProtectedRoute` handles no-role and MFA; `FeatureUnavailable` page exists; toasts via sonner.
6. **Risk register** — table with: risk, likelihood, impact, owner, recommended action.
7. **Recommended action list, prioritised** — P0 (do before next prod traffic spike), P1 (this sprint), P2 (backlog). Each item links back to the section that explains it.
8. **Appendix** — raw linter output, slow-query top 10, edge function inventory, dependency versions of note.

## Chat summary

After writing the doc, I will post a short chat summary with: the per-area verdict table, the P0/P1 items, and a link to the file.

## Out of scope

- No code, schema, RLS, or config changes.
- No new tests written.
- No dependency upgrades.

## Technical notes

- File created: `docs/production-audit.md` (single new file).
- No migrations, no edge function deploys, no secret changes.
- Sources cited inline with file paths or linter rule IDs so each finding is verifiable.
