# Admin toolbar + manual user creation

## 1. Reusable action toolbar component
Create `src/components/admin/PageActions.tsx` — a thin wrapper that gives every admin page header the same mobile-friendly layout:

```tsx
// <PageActions>{...buttons}</PageActions>
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:flex-wrap sm:justify-end">
  {children}
</div>
```

On mobile, buttons stack full-width via a `[&>*]:w-full sm:[&>*]:w-auto` rule so each trigger fills the row (matching the New Appointment / New Invoice baseline). On `sm+`, they sit inline-right.

Wire it into the page headers of:
- `src/pages/admin/AdminJobs.tsx` — wraps the `New Job` Dialog trigger.
- `src/pages/admin/AdminInventory.tsx` — wraps the `Add Item` Dialog trigger (also re-confirm `DialogTrigger` import and `DialogTrigger asChild` usage; the previous fix landed but verify against the current file).
- `src/pages/admin/AdminClients.tsx` — wraps the `Add Client` Dialog trigger.
- `src/pages/admin/AdminAccessReview.tsx` — wraps the `Export CSV` button.
- `src/pages/admin/AdminAppointments.tsx` + `src/pages/admin/AdminInvoices.tsx` — adopt the same wrapper so the visual baseline is preserved everywhere.

## 2. Mobile audit (no layout/data changes beyond the toolbar)
Use Playwright at 390×844 with the admin session restored to load `/admin/jobs`, `/admin/inventory`, `/admin/clients`, `/admin/access-review`. For each, screenshot:
- Skeleton/initial-load frame (catches the "overlaps before loading" flicker).
- Fully loaded frame.
- After scrolling to the bottom of the page.

Confirm `document.documentElement.scrollWidth === clientWidth` (no horizontal scroll). Any offender gets `min-w-0 max-w-full` on its root + `overflow-hidden` on its card, and skeleton rows aligned to the responsive column visibility already used. No business logic changes.

## 3. Admin can manually create users
Currently `AdminUsers` only lists and deletes — there's no Create User flow. Add one:

### Backend
New edge function `supabase/functions/admin-create-user/index.ts` (modeled on `create-client`):
- Auth-gated: caller must hold the `admin` role (check via `user_roles` + service-role client).
- Accepts `{ email, full_name, role, phone?, send_invite? }` where `role ∈ {admin, manager, staff, client}`.
- Uses `adminClient.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } })`.
- Inserts/upserts into `public.user_roles` with the chosen role.
- Updates `profiles` with `full_name` / `phone`.
- Returns `{ user_id }`.

Guardrail: creating another `admin` requires the caller to be `admin` (managers can only create `manager/staff/client`). This matches the existing manager-escalation policy.

No DB migration is required — `user_roles` already exists with proper RLS, and the edge function uses the service-role client to bypass policies safely.

### Frontend
Update `src/pages/admin/AdminUsers.tsx`:
- Add the new `PageActions` toolbar to the page header with a `New User` button.
- Add a Dialog with fields: Full Name, Email, Role (Select: admin/manager/staff/client; admin option hidden for non-admin callers), Phone (optional).
- On submit, call `supabase.functions.invoke("admin-create-user", { body })`, toast result, refresh the list.
- Show inline validation (email format, required fields) and disable submit while in flight.

## Technical details
- New file: `src/components/admin/PageActions.tsx`.
- New file: `supabase/functions/admin-create-user/index.ts` (deploys automatically).
- Edits: `AdminUsers.tsx` (header + dialog), `AdminJobs.tsx`, `AdminInventory.tsx`, `AdminClients.tsx`, `AdminAccessReview.tsx`, `AdminAppointments.tsx`, `AdminInvoices.tsx` (wrap header actions in `PageActions`).
- No schema migration. No new secrets.

## Verification
- Playwright mobile (390×844) screenshots of `/admin/users`, `/admin/jobs`, `/admin/inventory`, `/admin/clients`, `/admin/access-review` showing aligned, full-width buttons and no horizontal scroll.
- Manual smoke: open `/admin/users`, click `New User`, create a `staff` user, confirm the row appears and the new user can sign in.
