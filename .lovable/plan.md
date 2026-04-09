

## Add Super Admin Email Field for Issue Reports

### What We're Building
A new dedicated "Super Admin Email" field in Admin Settings where the admin can enter an external email address. Bug/issue reports submitted by users will be sent to this email instead of the general `contact_email`.

### Changes

**1. Database migration — add column to `workshop_settings`**
- Add `super_admin_email text` column (nullable, default null)
- Update the `workshop_settings_public` view to NOT expose this field (it's private)

**2. Admin Settings page — `src/pages/admin/AdminSettings.tsx`**
- Add `super_admin_email` to the `defaultSettings` object and `Settings` type
- Load and save the new field alongside existing settings
- Add a new input field in the Email / Notifications section labeled "Super Admin Email" with helper text: "Issue reports from users will be sent to this address"

**3. Report Issue page — `src/pages/support/ReportIssue.tsx`**
- Change the email recipient lookup: instead of using `settings.contact_email`, use `settings.super_admin_email`
- Fall back to `contact_email` if `super_admin_email` is not set

**4. Fix existing build errors**
- `AdminFeedback.tsx` and `ReportIssue.tsx`: The `bug_reports` table is missing from the generated Supabase types. A migration to create the table (if not present) or a type regeneration is needed. Alternatively, cast with `as any` to unblock.
- `AdminAppointments.tsx` (line 163): missing `due_date` and `isQuote` properties
- `GoalsPage.tsx`: column `value` doesn't exist on `job_tasks` query
- `JobDetail.tsx` (line 449): `role` doesn't exist on `NotificationPayload`

### Technical Details
- The `super_admin_email` column stores a plain email string in `workshop_settings`
- RLS already restricts `workshop_settings` reads to admin/manager, so the email is protected
- The `ReportIssue.tsx` query already reads from `workshop_settings` with `.eq("id", 1)` — we just add `super_admin_email` to the select list

