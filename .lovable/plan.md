# Sprint 2 — Reliability, Performance, Strictness

Sprint 1 shipped caching defaults, indexes, CI, rate limits, CSP report-only, uptime runbook, and new unit tests. Sprint 2 tackles the next batch from `.lovable/plan.md`.

## 1. Bundle audit & lazy loading (1.4)
- Run `vite build` and inspect the chunk report.
- Confirm `GoalsPage` / `GoalsAnimations` (Remotion) are lazy-loaded in `App.tsx`; if not, wrap with `React.lazy` + `Suspense` and gate behind the `goals` feature flag.
- Audit other heavyweight imports (`@react-pdf/renderer`, `recharts`) — ensure they're only pulled into the routes that need them (lazy-load `InvoiceDetail` PDF generator, `AdminReports`).
- Keep `chunkSizeWarningLimit` at 700kB to surface regressions.

## 2. Service worker consolidation (1.5)
- Move push/notificationclick handlers from `public/push-sw.js` into `src/sw.ts` (already partially present — verify parity for `icon`, `badge`, `data.url`).
- In `src/hooks/usePushSubscription.ts`, register against the Workbox-built SW (`/sw.js`) instead of `/push-sw.js`.
- On app boot, unregister any existing `/push-sw.js` registration to avoid scope overlap.
- Delete `public/push-sw.js` after the migration.

## 3. pgTAP RLS regression tests (2.3)
- Add `supabase/tests/rls/` with pgTAP specs covering: `profiles`, `user_roles`, `signup_codes`, `invoices`, `invoice_items`, `workshop_admin_contacts`, `workshop_settings`, `mfa_rate_limits`, `push_subscriptions`, `dismissed_notices`, `dismissed_broadcasts`.
- Each spec asserts: anon denied, wrong-role authenticated denied, correct role allowed, privilege-escalation INSERT/UPDATE denied.
- Add `supabase/tests/README.md` documenting `supabase db test` workflow.
- Add a `rls-tests` job to `.github/workflows/ci.yml` that runs `supabase start` → `supabase db reset` → `supabase test db`.

## 4. Sentry on edge functions (2.5)
- Create `supabase/functions/_shared/sentry.ts` wrapping `@sentry/deno` initialised from a `SENTRY_DSN` secret. Export `withSentry(handler)` that wraps `Deno.serve` callbacks in `try/catch → Sentry.captureException → re-throw`.
- Apply `withSentry` to all 19 edge functions.
- Add `SENTRY_DSN` via `add_secret` (user-supplied, optional — handler must no-op when missing so local/dev keeps working).

## 5. TypeScript strict mode — phase B (3.1B)
- Flip `strict: true` and `noImplicitAny: true` in `tsconfig.json` + `tsconfig.app.json` (strictNullChecks already enabled in phase A — verify first).
- Fix surfaced errors. Expected hotspots: Supabase row types (`workshop_settings`, `profiles`), edge-function response casts, `any` payloads in `notifications.ts`, `csv.ts`, recharts label renderers.
- Keep `noUnusedLocals` / `noUnusedParameters` off — that's phase C in Sprint 4.
- Validate with `tsc --noEmit` and full vitest run.

## 6. Audit doc
- Update `docs/production-audit.md` §9 with Sprint 2 completion notes and remaining Sprint 3/4 scope.

## Technical notes
- Sentry on Deno uses `https://deno.land/x/sentry/index.mjs`. The wrapper should keep startup cheap (lazy init, single instance per cold start).
- pgTAP: enable extension via migration only inside the test schema if not already present; otherwise rely on `supabase/seed.sql` test fixtures.
- Don't touch security-related logic — Sprint 2 is pure reliability + perf + types.

## Exit criteria
- `vite build` shows no chunk >700kB without justification.
- Single SW serves precache + push; `/push-sw.js` gone.
- `supabase test db` green locally and in CI.
- All edge functions report errors to Sentry when DSN is set.
- `tsc --noEmit` passes with `strict: true`.
- `docs/production-audit.md` reflects new state.

## Out of scope
- Sprint 3 items (Deno function tests, a11y pass, lint plugins, uptime monitor wiring).
- Sprint 4 items (CSP enforced, `noUnusedLocals`, SLO docs).
- Any new product features or security fixes.
