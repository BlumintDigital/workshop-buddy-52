## 1. Align header buttons to the left on mobile

In `src/components/admin/PageActions.tsx`, change the toolbar from `justify-end` to `justify-start sm:justify-end` so action buttons (New Item, New Job, New Client, New User, etc.) align to the left edge of the page on mobile while staying right-aligned on desktop.

No other page changes needed — every admin page already routes its header buttons through `PageActions`.

## 2. Stop the auth page from flashing after sign-in

Two causes, both fixed in routing / gating:

**Cause A — Root redirect ignores the signed-in user.**
`src/App.tsx` always renders `<Navigate to="/auth" replace />` for `/`. On a hard refresh of `/` (or the brief moment after `signIn` resolves and before the dashboard chunk loads), the signed-in user is bounced through `/auth`, which renders the login form for a frame before its own effect navigates to the dashboard.

Fix: replace the static redirect with a small `IndexRedirect` component that:
- shows `<LoadingScreen />` while `useAuth().loading` is true,
- sends MFA-pending users to `/auth`,
- sends signed-in users with a known `role` to `getRoleDashboardPath(role)`,
- otherwise falls back to `/auth`.

**Cause B — Auth page renders its form before the role hydrates / before the MFA step is recognized.**
Right after `signIn` returns, `loading` is briefly `false` but `role` / `needsMfaVerification` haven't propagated through the auth listener yet. The Auth page falls through the early-return guards and paints the tabs UI for a frame.

Fix in `src/pages/Auth.tsx`: before rendering the tabs, also return `<LoadingScreen />` when:
- `submitting` is true, or
- `user` exists but `role` is still null and we're not on the MFA step, or
- `needsMfaVerification` is true but `pendingMfaFactorId` hasn't arrived yet.

This keeps the loader visible across the gap between "sign-in succeeded" and "dashboard mounted" so the auth form never reappears.

### Technical notes

- `IndexRedirect` lives inside `AppRoutes` so it has access to `useAuth()`; it returns a `<Navigate replace>` once state is known.
- No changes to `ProtectedRoute`, `useAuth`, or any dashboard page.
- No backend, schema, or RLS changes.

### Files changed

- `src/components/admin/PageActions.tsx` — justify class swap.
- `src/App.tsx` — add `IndexRedirect`, use it for the `/` route.
- `src/pages/Auth.tsx` — extend the early `LoadingScreen` guard.
