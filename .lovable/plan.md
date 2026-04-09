

## Plan: Add "Factory Reset" Option for Full Environment Reset

### What it does
Adds a new "Factory Reset" button in the Admin Settings > Data tab that deletes **all** business data AND all non-admin user accounts, effectively returning the system to a fresh installation state. The current admin performing the reset is preserved.

### Changes

**1. Update `delete-data` Edge Function** (`supabase/functions/delete-data/index.ts`)
- Add an optional `reset_users` boolean parameter in the request body
- When `reset_users: true`, after deleting business data:
  - Delete all rows from `user_roles` except the caller's
  - Delete all rows from `profiles` except the caller's
  - Use the Supabase Admin Auth API to delete all user accounts except the caller's
  - Clear `activity_logs` table
  - Reset `workshop_settings` to defaults (preserve only the row with id=1, clear optional fields)
- Return counts of deleted users alongside deleted data

**2. Update Admin Settings UI** (`src/pages/admin/AdminSettings.tsx`)
- Add a new "Factory Reset" card below the existing "Delete All Data" card with a more prominent warning style
- Include a confirmation dialog requiring the admin to type "RESET" to confirm
- Call `delete-data` with `{ reset_users: true }`
- On success, sign out the current user and redirect to `/auth`

### Technical Details

- The edge function already validates the caller is an admin via JWT + `user_roles` check
- User deletion uses `adminClient.auth.admin.deleteUser(userId)` for each non-caller user
- The caller's own account, profile, and admin role are preserved
- Activity logs are cleared since they reference deleted users
- Workshop settings row is kept but optional fields (name, logo, etc.) are nulled out

