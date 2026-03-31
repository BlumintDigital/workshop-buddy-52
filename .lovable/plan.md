

## Hide Super Admin from Instance Users List

### Problem
When a super admin account is provisioned on an instance via `ensure-super-admin`, it appears in the AdminUsers and ManagerStaff user lists — it should be invisible to instance users.

### Approach
Mark super admin accounts with a flag in `user_metadata`, then filter them out in the UI queries.

### Changes

**1. `supabase/functions/admin-api/index.ts`** — Tag super admin on creation
- When creating a new user, add `is_super_admin: true` to `user_metadata`
- When an existing user is promoted, update their metadata via `auth.admin.updateUserById()` to add `is_super_admin: true`

**2. `src/pages/admin/AdminUsers.tsx`** — Filter out super admins
- After merging roles + profiles, filter out any user whose profile has `is_super_admin` metadata
- Since we can't read `auth.users` metadata from the client, we'll store the flag on the `profiles` table instead (a new `is_super_admin` boolean column, defaulting to `false`)

**Revised approach — use `profiles.is_super_admin` column:**

**1. New migration** — Add `is_super_admin` column to `profiles`
```sql
ALTER TABLE profiles ADD COLUMN is_super_admin boolean NOT NULL DEFAULT false;
```

**2. `supabase/functions/admin-api/index.ts`** — Set the flag
- In `ensure-super-admin`, after ensuring admin role, also set `profiles.is_super_admin = true` for that user

**3. `src/pages/admin/AdminUsers.tsx`** — Filter out super admins
- Update the profiles query to include `is_super_admin`
- Filter: `merged.filter(u => !u.is_super_admin)`

**4. `src/pages/manager/ManagerStaff.tsx`** — Same filter
- Include `is_super_admin` in profiles select
- Filter out super admin entries

### Files to modify
- New migration file (add `is_super_admin` column)
- `supabase/functions/admin-api/index.ts` (set flag in `ensure-super-admin`)
- `src/pages/admin/AdminUsers.tsx` (filter out)
- `src/pages/manager/ManagerStaff.tsx` (filter out)

