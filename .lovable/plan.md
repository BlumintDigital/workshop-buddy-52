## Plan: MFA Enhancements — Trusted Devices, Backup Codes, Recovery

### Overview
Add three improvements to the existing TOTP MFA flow:
1. "Remember this device" checkbox on the MFA prompt (skip TOTP on that device for 30 days).
2. Generate / view / regenerate / download backup codes from User Profile.
3. "Use a backup code" recovery option on the MFA prompt for users who lost their authenticator.

### Important architectural note
Supabase's native MFA (`auth.mfa.verify`) always requires a real TOTP code to elevate the session to AAL2. Backup codes and trusted-device skipping cannot mint AAL2 sessions on their own. We will therefore enforce the MFA gate at the **application level** (the existing `needsMfaVerification` flag in `useAuth`) rather than relying on Supabase AAL. Trusted devices and backup-code recovery clear that app-level gate; the Supabase session stays at AAL1. Today no RLS policy depends on AAL, so this is safe; if that changes later, those policies would need to switch to a different signal.

### Database changes (one migration)
New tables (both with RLS, owner-scoped):
- `mfa_trusted_devices` — `user_id`, `token_hash` (sha-256 of opaque token stored in localStorage), `device_label` (UA-derived), `expires_at`, `last_used_at`.
- `mfa_backup_codes` — `user_id`, `code_hash` (sha-256), `used_at` (nullable). Unique on (`user_id`, `code_hash`).

RLS: users can `select`/`delete` their own rows. All inserts/verification go through edge functions using the service role, so policies stay tight.

### Edge functions
All validate the caller's JWT and operate on `auth.uid()`.

1. `mfa-trust-device` — accepts a freshly-verified TOTP challenge id + token, records a trusted-device row, returns the opaque token for localStorage.
2. `mfa-check-device` — accepts the localStorage token, returns `{ trusted: true }` if a non-expired hash matches; bumps `last_used_at`.
3. `mfa-backup-generate` — generates 10 random codes (format `XXXX-XXXX`), wipes any existing codes for the user, stores hashes, returns plaintext codes **once**.
4. `mfa-backup-verify` — accepts a code, marks the matching row `used_at = now()`, returns success. Caller then clears the app-level MFA gate (and optionally trusts the device).

### Frontend changes

**`src/hooks/useAuth.tsx`**
- On sign-in, after detecting `needsMfa`, also call `mfa-check-device` with the localStorage token. If trusted, set `needsMfaVerification = false` immediately so the user lands in the app without seeing the prompt.
- Expose a `trustCurrentDevice()` helper and a `clearTrustedDevice()` helper (called on sign-out and on MFA disable).

**`src/pages/Auth.tsx` (MFA step UI)**
- Add a "Remember this device for 30 days" checkbox below the OTP input.
- On successful `mfa.verify`, if checkbox checked, call `mfa-trust-device` and store the returned token in localStorage under `mfa_device_token`.
- Add a "Use a backup code instead" link that swaps the OTP input for a backup-code input and a "Verify backup code" button (calls `mfa-backup-verify`, then `clearMfaFlag()` + optional trust-device).

**`src/pages/profile/UserProfile.tsx` (Two-Factor card)**
- When MFA is enabled, add a "Backup codes" subsection with:
  - "Generate backup codes" button (first time) / "Regenerate" button (replaces existing).
  - Modal showing the 10 codes once with Copy and Download (`.txt`) buttons and a confirmation checkbox ("I have saved these codes") before dismissing.
  - Status line: "X of 10 codes remaining" (counts unused rows).
- When MFA is disabled, also clear backup codes + trusted devices server-side.
- Add a small "Trusted devices" list with a "Revoke all" button.

### Files touched
- New migration (tables + RLS + grants).
- New edge functions: `supabase/functions/mfa-trust-device/`, `mfa-check-device/`, `mfa-backup-generate/`, `mfa-backup-verify/` (each with `index.ts`); register in `supabase/config.toml`.
- `src/hooks/useAuth.tsx`
- `src/pages/Auth.tsx`
- `src/pages/profile/UserProfile.tsx`
- New small component `src/components/mfa/BackupCodesDialog.tsx` for the one-time code display.

### Out of scope
- Per-device management UI beyond "Revoke all" (can be added later).
- SMS / email fallback factors.
- Changing Supabase AAL behavior or RLS to require AAL2.
