

# Security Enhancements: Session Expiry + TOTP 2FA

## What this delivers

1. **Time-based session expiry** -- Sessions automatically expire after a configurable inactivity period. Users are logged out and redirected to the login page.
2. **TOTP Two-Factor Authentication** -- Users can enable 2FA from their profile using any authenticator app (Google Authenticator, Authy, etc.). Once enabled, login requires a 6-digit code after password entry.

---

## Plan

### 1. Session inactivity timeout

**File: `src/hooks/useAuth.tsx`**
- Add an inactivity timer (default: 30 minutes) that tracks user interaction (mouse, keyboard, touch events)
- On inactivity timeout, call `signOut()` and show a toast: "Session expired due to inactivity"
- Reset the timer on any user activity
- Store `SESSION_TIMEOUT_MS` as a constant (configurable, e.g. 30 min)
- Also check `session.expires_at` on each auth state change -- if the JWT is expired, force sign out

### 2. TOTP 2FA enrollment (Profile page)

**File: `src/pages/profile/UserProfile.tsx`**
- Add a "Two-Factor Authentication" card below the existing profile card
- Show current MFA status by calling `supabase.auth.mfa.listFactors()`
- If no TOTP factor enrolled: show "Enable 2FA" button
- On click, call `supabase.auth.mfa.enroll({ factorType: 'totp' })` and display the QR code + secret
- User enters 6-digit code from their authenticator app
- Call `supabase.auth.mfa.challengeAndVerify()` to verify enrollment
- If already enrolled: show "Disable 2FA" button that calls `supabase.auth.mfa.unenroll()`

### 3. TOTP 2FA verification during login

**File: `src/pages/Auth.tsx`**
- After successful `signInWithPassword`, check `data.session` for the AAL (Authenticator Assurance Level)
- If user has MFA factors but session is only `aal1`, show a verification step instead of navigating to dashboard
- New state: `mfaStep` with `factorId` and `challengeId`
- Display a 6-digit OTP input (using existing `InputOTP` component) prompting for the authenticator code
- On submit, call `supabase.auth.mfa.challengeAndVerify({ factorId, code })`
- On success, proceed to dashboard
- On failure, show error and allow retry

**File: `src/hooks/useAuth.tsx`**
- Update `onAuthStateChange` handler: when session exists, call `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
- If `currentLevel` is `aal1` but `nextLevel` is `aal2`, set a flag `needsMfaVerification` so the app can redirect to the MFA verification step
- Expose `needsMfaVerification` from the auth context

**File: `src/components/ProtectedRoute.tsx`**
- If `needsMfaVerification` is true, redirect to `/auth` (so user completes MFA)

### 4. No database changes needed

Supabase Auth handles MFA factor storage internally. No new tables or migrations required.

---

## Technical details

### Inactivity timer approach
```text
User activity (mousemove/keydown/click/touchstart)
  --> reset timer to SESSION_TIMEOUT_MS (30 min)
  --> on timeout: signOut() + toast + redirect to /auth
```

### MFA login flow
```text
Email + Password
  --> signInWithPassword()
  --> Check AAL level
  --> If aal1 + factors exist:
       --> Show OTP input
       --> challengeAndVerify()
       --> aal2 session granted
  --> Navigate to dashboard
```

### Files modified
| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Add inactivity timer, MFA assurance level check, expose `needsMfaVerification` |
| `src/components/ProtectedRoute.tsx` | Redirect if MFA verification pending |
| `src/pages/Auth.tsx` | Add MFA verification step after password login |
| `src/pages/profile/UserProfile.tsx` | Add 2FA enrollment/unenrollment UI with QR code |

