## Plan: MFA hardening — rate limits, lockouts, and clearer recovery UX

Note: the backend has no shared rate-limit primitive. The plan below uses an ad-hoc, DB-backed counter table — simple and works today, but is per-user (not per-IP) and lives in Postgres. If you later add a proper rate-limiter (Redis/edge), these checks can be swapped out.

### 1. New rate-limit table (one migration)

`mfa_rate_limits` — one row per (`user_id`, `action`). Tracks `attempt_count`, `window_started_at`, `locked_until`. RLS: users may `SELECT` their own row (so the UI can show countdowns); all writes happen in edge functions via service role.

Limits applied (per user):

| Action | Limit | Lockout |
|---|---|---|
| `backup_generate` | 3 regenerations per hour | 1h cooldown after limit |
| `trust_device` | 5 trusts per hour | 1h cooldown after limit |
| `backup_verify` | 5 failed attempts per 15 min | 15 min lockout |

### 2. Edge function changes

Add a small shared helper `_shared/rate-limit.ts` exposing `checkAndConsume(userId, action, { limit, windowSec, lockoutSec })`. It returns `{ allowed, remaining, retryAfterSec, lockedUntil }`. On lockout it returns `allowed: false` without consuming further; successful `backup_verify` resets the counter.

Wire it into:
- `mfa-backup-generate` — block when over limit, return `429` with `retry_after_sec`.
- `mfa-trust-device` — same.
- `mfa-backup-verify` — check before verifying; **increment only on failure**, reset on success. Response also includes `remaining_attempts` so the UI can show it.

### 3. Frontend: backup-code recovery form (`src/pages/Auth.tsx`)

- Add live formatting/validation: input is masked to `XXXX-XXXX` (uppercase, A–Z 2–9, auto-insert dash). When the value doesn't match the pattern, show an inline red helper and red border on the input — Verify stays disabled.
- Show specific server errors instead of a generic toast:
  - Invalid code → inline "That code didn't match. X attempts remaining before lockout."
  - Already used → "This backup code was already used. Try another."
  - Locked out → disable the form, show "Too many attempts. Try again in M:SS." with a live countdown driven by `retry_after_sec`.
- Persist a small in-memory attempt counter for nicer messaging between server responses.

### 4. Frontend: trusted device confirmations (`src/pages/profile/UserProfile.tsx`)

- Replace the bare "Revoke all trusted devices" button with an `AlertDialog` confirmation ("Revoke all trusted devices? You'll need to enter a 2FA code on each device next time."). Confirm → delete → success toast; failure → error toast with the message.
- Same dialog pattern wrapping the "Regenerate codes" button when codes already exist ("Regenerating invalidates your existing X codes. Continue?"). Plus a cooldown-aware disabled state + toast when the server returns 429 ("You can regenerate again in M:SS").
- If/when we add per-device revoke (future), it reuses the same `AlertDialog` component.

### 5. UI plumbing

- New tiny `useCountdown(seconds)` hook in `src/hooks/useCountdown.ts` for the locked-until / cooldown timers.
- Reuse existing shadcn `AlertDialog` (already in the project).

### Files touched
- New migration: `mfa_rate_limits` table + RLS + grants.
- New: `supabase/functions/_shared/rate-limit.ts`.
- Edit: `supabase/functions/mfa-backup-generate/index.ts`, `mfa-trust-device/index.ts`, `mfa-backup-verify/index.ts`.
- New: `src/hooks/useCountdown.ts`.
- Edit: `src/pages/Auth.tsx` (backup-code form upgrades).
- Edit: `src/pages/profile/UserProfile.tsx` (confirm dialogs, cooldown handling).

### Out of scope
- Per-IP rate limiting (needs infra we don't have).
- CAPTCHA / progressive delays beyond the lockout window.
- Per-device "revoke this one" UI.
