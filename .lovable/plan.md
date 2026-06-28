# Plan: Close the three "Needs Work" verdicts from the production audit

Goal: turn Performance, Reliability, and Code Quality from ⚠️ to ✅. Security housekeeping (P0 items #1–#3) is excluded — it's already ✅ and handled separately.

---

## 1. Performance & scalability

**1.1 Cache hot session reads in React Query**
- Add a `QueryClient` default of `staleTime: 5 min`, `gcTime: 30 min` (already present? verify in `main.tsx`).
- Create `useWorkshopSettings()` and `useUserRole()` hooks backed by `useQuery` with keys `["workshop-settings"]` and `["user-role", userId]`, `staleTime: 10 min`.
- Replace ad-hoc `supabase.from('workshop_settings')` / `user_roles` fetches in `useAuth`, `AppHeader`, `AppSidebar`, `useFeatureFlags`, branding loader, currency hook, etc. with the shared hooks.
- Invalidate on settings save and on role change events only.
- Expected impact: removes the top two slow queries (≈15.5s total / 1061 calls).

**1.2 Consolidate banner polling**
- Merge `broadcasts` + `system_notices` fetches behind one `useNotices()` query, `staleTime: 2 min`, refetch on window focus only (drop interval polling).
- Single query feeds both `BroadcastBanner` and `SystemNoticesBanner`.

**1.3 Indexes**
- Migration adding:
  - `CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);`
  - `CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);`
- Confirm with `EXPLAIN` before/after.

**1.4 Bundle audit**
- Run `vite build`, inspect chunk report.
- If Remotion isn't on a critical path, lazy-load `GoalsAnimations` only (already lazy in `App.tsx`? confirm) and gate Remotion import behind the `goals` feature flag.
- Lower `chunkSizeWarningLimit` back to 600 to surface regressions.

**1.5 Service worker scope**
- Fold `push-sw.js` push/notificationclick handlers into `src/sw.ts` and unregister `push-sw.js` on app boot to remove scope overlap.

---

## 2. Reliability & operations

**2.1 CI hardening** (`.github/workflows/ci.yml`)
- Add `build` job running `npm run build`.
- Add `e2e` job running `npx playwright install --with-deps chromium && npx playwright test` against a built preview.
- Add `supabase db diff --linked --schema public` dry-run job (non-blocking warning) to catch drifted migrations.

**2.2 Playwright smoke specs** (`tests/e2e/`)
- One spec per role: `admin.spec.ts`, `manager.spec.ts`, `staff.spec.ts`, `client.spec.ts`.
- Flow: sign in (test user per role from CI secrets) → land on role dashboard → assert key nav item visible.
- Add a `mfa.spec.ts` covering TOTP + backup-code path using a seeded test user.

**2.3 RLS regression tests**
- Add `supabase/tests/rls/` with pgTAP specs for `profiles`, `user_roles`, `signup_codes`, `invoices`, `workshop_admin_contacts`, `mfa_*`.
- New CI job spins up `supabase start`, runs migrations, executes `supabase test db`.

**2.4 Edge function tests**
- Deno tests for `mfa-backup-verify`, `mfa-trust-device`, `admin-create-user`, `validate-signup-code` using `supabase test edge-functions`.
- Wire into CI.

**2.5 Edge function error reporting**
- Add `_shared/sentry.ts` wrapping `@sentry/deno` init from `SENTRY_DSN` secret.
- Wrap every function handler with a `try/catch → Sentry.captureException` helper.
- New secret: `SENTRY_DSN` (add via `add_secret`).

**2.6 Per-user rate limits**
- Apply existing `_shared/rate-limit.ts` to `send-push` and `send-email` (e.g. 30/hour/user).

**2.7 Backups & uptime**
- Document Supabase Pro PITR confirmation step in `docs/incident-response.md` (no code, just runbook update).
- Add `docs/uptime.md` describing the external monitor (BetterUptime/UptimeRobot) and the `/api/health` style check — implement a tiny `/health` route in `App.tsx` (or a Vercel edge function) returning 200.
- Optional: GitHub Action running `backup-data` weekly via `curl`, storing the manifest in repo Releases.

---

## 3. Code quality & UX

**3.1 TypeScript strictness, phased**
- Step A: flip `strictNullChecks: true` in `tsconfig.json` + `tsconfig.app.json`. Fix surfaced errors (expected hotspots: Supabase row types, optional chaining around `profile`, `workshop_settings`, route params).
- Step B: flip `strict: true`, `noImplicitAny: true`. Fix the remaining errors.
- Step C: turn on `noUnusedLocals` + `noUnusedParameters` last (cleanup pass).
- Keep each step in its own PR so CI bisects cleanly.

**3.2 ESLint**
- Re-enable `@typescript-eslint/no-unused-vars` as `warn` after step C.
- Add `eslint-plugin-react` recommended rules and `jsx-a11y` recommended for accessibility lint.

**3.3 Unit test depth**
- Add vitest specs for: `useCurrency`, `useFeatureFlags`, `usePushSubscription`, `lib/email`, `lib/csv`, `lib/notifications`, `redeem_signup_code` client wrapper.
- Aim for ≥ 30 unit test files (current 7).

**3.4 Accessibility spot-fixes**
- Keyboard navigation pass on `StaffKanban` (arrow keys to move cards, Enter to open).
- Focus return after `AlertDialog` close on revoke device flow.
- Run `@axe-core/playwright` in the e2e suite; fail on serious/critical violations.

**3.5 CSP**
- Add report-only CSP via `vercel.json` headers, allow-listing Supabase, Sentry, Resend (image), self.
- After one week of report-only with no real violations, flip to enforced.

---

## Sequencing & rollout

| Sprint | Focus | Owner load |
|---|---|---|
| Sprint 1 | 1.1, 1.2, 1.3 caching/indexes; 2.1 CI build + 2.2 Playwright smoke; 3.1A strictNullChecks | High |
| Sprint 2 | 1.4, 1.5 bundle/SW; 2.3 pgTAP RLS; 2.5 Sentry on edge; 3.1B strict | Medium |
| Sprint 3 | 2.4 Deno function tests; 2.6 rate limits; 2.7 uptime/PITR; 3.2/3.3/3.4 lint/tests/a11y | Medium |
| Sprint 4 | 3.5 CSP enforced; 3.1C cleanup; doc the new SLOs in `docs/production-audit.md` | Low |

## Exit criteria
- All three audit verdicts re-scored to ✅ in an updated `docs/production-audit.md`.
- CI: typecheck + lint + unit + build + e2e + pgTAP + edge-function tests all green on PR.
- `pg_stat_statements`: `workshop_settings` and `user_roles` no longer in top 5 by total time.
- `tsc --noEmit` passes with `strict: true`.
- External uptime monitor live with 99.9% target; Sentry receives edge-function errors.

## Out of scope
- Security P0 items (leaked-password toggle, PITR confirmation, SECURITY DEFINER cleanup) — already tracked in audit §7.
- New product features.
- Visual redesign.
