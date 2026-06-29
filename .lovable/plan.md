## Problem

Resend invite fails with "Failed to send a request to the Edge Function". This is a CORS/preflight failure, not a server error.

The other admin functions (`admin-create-user`, `admin-set-user-role`, `admin-delete-user`) use the shared `buildCorsHeaders(req)` helper from `supabase/functions/_shared/mfa-cors.ts`, which dynamically allows Lovable preview domains, localhost, and `*.shoplane.uk`.

`admin-resend-invite/index.ts` still uses an older inline `ALLOWED_ORIGINS` pattern. When `ALLOWED_ORIGINS` is set to a specific origin (e.g. `https://ieq.shoplane.uk`), preview/localhost calls fail the preflight, and the browser surfaces the request as "Failed to send a request to the Edge Function".

Edge function logs confirm no invocation reaches the handler — only `shutdown` is recorded, consistent with a preflight being rejected before the POST is sent.

## Fix

Refactor `supabase/functions/admin-resend-invite/index.ts` to:

1. Import and use `buildCorsHeaders(req)` from `../_shared/mfa-cors.ts` (matching the other admin functions).
2. Remove the inline `allowedOrigins` / `corsHeaders` helper.
3. Keep all existing logic (auth check, role gating, cooldown, invite/recovery fallback, profile update).

No frontend, database, or other function changes are needed.