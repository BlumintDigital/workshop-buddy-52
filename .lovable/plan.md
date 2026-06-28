## Goal

1. Show an invite status column ("Invited" vs "Active") for each user on `/admin/users`, with a "Resend invite" action available on pending users.
2. Make the mobile "New User" button render identically to the other PageActions buttons (e.g. "New Appointment", "New Invoice"): full-width, same height/style.

## 1. Track invitation state

The current `admin-create-user` flow creates the auth user and calls `generateLink({ type: "recovery" })`, but nothing records whether the invite was sent or accepted.

**Migration**
Add two columns to `public.profiles`:
- `invited_at timestamptz null` — set when admin-create-user (or resend) sends an invite.
- `invite_accepted_at timestamptz null` — set on first successful sign-in.

No RLS change needed (existing profile policies already cover these columns).

**Edge functions**
- `admin-create-user`: switch from `generateLink` to `inviteUserByEmail(email, { data: { full_name, role } })` so Supabase actually sends the email via the configured SMTP, then `UPDATE profiles SET invited_at = now()` for the new user.
- New `admin-resend-invite`:
  - Same auth/role guard as `admin-create-user` (admin or manager; managers can't target admins).
  - Body: `{ user_id }`.
  - Look up the user's email via `auth.admin.getUserById`, call `inviteUserByEmail` (or `generateLink type=recovery` as fallback), then bump `profiles.invited_at = now()`.
  - Lightweight cooldown: reject if `invited_at > now() - interval '60 seconds'`.

**Marking invite accepted**
In `src/hooks/useAuth.tsx`, after a successful sign-in where the session user is freshly loaded, if `profiles.invite_accepted_at` is null, `update` it to `now()`. One-time per user.

## 2. AdminUsers UI

In `src/pages/admin/AdminUsers.tsx`:
- Extend `UserRow` with `invited_at` and `invite_accepted_at`; include them in the `profiles` select.
- Derive `inviteStatus`: `"accepted"` if `invite_accepted_at` is set, else `"invited"` if `invited_at` is set, else `"active"` (legacy users with no invite metadata — treat as accepted/active so we don't spam them).
- **Desktop table**: add a new `Invite` column between Role and Joined. Render a `Badge`:
  - Accepted/active → no badge or subtle "Active" outline badge.
  - Invited (pending) → amber "Invited {relative time}" badge + a small "Resend" ghost button (Mail icon) that calls `admin-resend-invite`. Show toast on success/error; disable while in-flight; show "Sent" briefly after success.
- **Mobile cards**: show the same badge + Resend button inline under the name.
- Skeleton rows updated to include the new column.

## 3. Mobile button parity

The Dialog/DialogTrigger combination in AdminUsers leaves the `Button` as the direct child of `PageActions`, so `[&>*]:w-full` should apply — but the visual mismatch the user is reporting suggests the button isn't stretching like "New Appointment". Fix by:
- Explicitly adding `className="w-full sm:w-auto"` to the trigger `Button` (matches the implicit behavior every other PageActions child gets through the wrapper).
- Verifying via Playwright at 390px viewport that the New User and New Appointment buttons render at identical width and styling.

## Technical notes

- `inviteUserByEmail` requires the project's Auth → Email templates to be configured; if the call fails we fall back to `generateLink` and return a non-fatal warning (same behavior as today).
- Cooldown is enforced server-side; the client also disables the button for ~60s after a successful resend.
- No new tables — just two columns on `profiles` and one new edge function.

## Out of scope

- Bulk resend.
- Email-template customization.
- Showing the actual recovery link in the UI.
