## Goal

Fork the project to a new customer (e.g. `sample.shoplane.uk`) and have **backup, restore, MFA, demo setup, seed/delete data, send-email, admin user toggle/delete, create-client** all work immediately — without editing code or setting env vars.

Customer-facing branded copy (footers, Privacy, Terms references to Shoplane/Blumint/ieq) is **intentionally left as-is** per your instruction.

## Root cause

Nine edge functions define CORS like this:
```ts
"Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://ieq.shoplane.uk"
```
Two issues:
1. The env name is `ALLOWED_ORIGIN` (singular). Your secret is `ALLOWED_ORIGINS` (plural). So the env var is silently ignored and every response pins to `ieq.shoplane.uk`.
2. The fallback is one fixed host. A fork on `sample.shoplane.uk` (or any other domain) gets its browser preflight blocked → "Failed to send a request to the Edge Function".

Affected files:
- `supabase/functions/_shared/mfa-cors.ts` (used by `backup-data`, `restore-data`, `mfa-backup-generate`, `mfa-backup-verify`, `mfa-trust-device`, `mfa-check-device`, `admin-delete-user`, `admin-toggle-user`)
- `supabase/functions/setup-demo/index.ts`
- `supabase/functions/seed-data/index.ts`
- `supabase/functions/create-client/index.ts`
- `supabase/functions/delete-data/index.ts`
- `supabase/functions/send-email/index.ts`

## Fix plan (CORS only)

### A. Rewrite the shared helper
In `supabase/functions/_shared/mfa-cors.ts`, export `buildCorsHeaders(req)` that:

- Reads the request's `Origin` header.
- Allows it when it matches any of:
  - Any `*.shoplane.uk` subdomain (covers `sample.shoplane.uk`, `ieq.shoplane.uk`, future customers — root `shoplane.uk` included).
  - Any `*.lovable.app` or `*.lovableproject.com` (Lovable preview / published).
  - `http://localhost:*` and `http://127.0.0.1:*` (local dev).
  - Any host listed in the `ALLOWED_ORIGINS` env (comma-separated) — escape hatch for non-Shoplane custom domains.
- Echoes the matched origin back in `Access-Control-Allow-Origin` (required because we send `Allow-Credentials: true`), with `Vary: Origin` so caches don't poison responses.
- Falls back to the first `ALLOWED_ORIGINS` entry, or `https://shoplane.uk`, when the request has no Origin (e.g. server-to-server calls).
- Keeps a `corsHeaders` named export for back-compat so the 8 functions that already `import { corsHeaders }` keep compiling. Internally that export is a static object built the same way, but new code should use `buildCorsHeaders(req)`.

### B. Switch every handler to the per-request builder
For each of the 9 functions above:
- Replace any inline `const corsHeaders = { ... }` block with `import { buildCorsHeaders } from "../_shared/mfa-cors.ts"`.
- At the top of `serve(async (req) => { ... })`, do `const cors = buildCorsHeaders(req);`.
- Use `cors` for the OPTIONS preflight reply and for every `Response` returned (success and error paths).

No other behaviour changes inside the functions.

### C. Out of scope (deliberately untouched)
- `src/pages/Auth.tsx`, `src/pages/ResetPassword.tsx`, `src/pages/ForgotPassword.tsx`, `src/components/layout/DashboardLayout.tsx` footer literals.
- `src/pages/Privacy.tsx` and `src/pages/Terms.tsx` Shoplane URLs and emails.

## Verification

- `rg "ieq\\.shoplane\\.uk" supabase/functions` returns zero hits.
- From `https://sample.shoplane.uk` (fork, no env vars set): **Create backup** downloads JSON; **Restore from backup** completes; MFA backup-code generation, trusted-device enrollment, demo setup, seed/delete data, send-email, admin-delete-user, admin-toggle-user, create-client all succeed without CORS errors.
- From a Lovable preview URL on the same fork: same checks pass.
- From a custom non-Shoplane domain after adding it to `ALLOWED_ORIGINS`: same checks pass.

No DB migration. No new secrets required. Roughly 9 edge-function files touched.