## Plan

1. **Replace broken role upserts**
   - Remove every `onConflict: "user_id"` write against `user_roles` in the admin user flow.
   - Use an atomic database function that assigns exactly one role by deleting the old role row(s) and inserting the requested role.
   - This directly fixes: `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

2. **Add a safe role-change backend path**
   - Add a `set_user_role` RPC or Edge Function-backed flow that:
     - Requires the caller to be an admin.
     - Allows admin to change another admin to staff/manager/client.
     - Prevents changing your own role.
     - Prevents demoting the last remaining admin.
     - Blocks changes to super-admin accounts.
   - Update `/admin/users` role dropdowns to call this backend path instead of direct Supabase `upsert`.

3. **Fix admin-created users becoming “half-created”**
   - Update `admin-create-user` so after Auth creates the account it assigns the role with the same safe role assignment logic.
   - If a role/profile step fails after Auth user creation, roll back by deleting the newly-created Auth user so the UI does not show a false success/partial account.
   - Return clear duplicate-email errors when the user already exists.

4. **Allow admin deletion of another admin safely**
   - Update `admin-delete-user` to remove the blanket “Cannot delete another admin account” block.
   - Keep protections for:
     - self-deletion,
     - super-admin deletion,
     - deleting the last remaining admin,
     - users with dependent records that should be deactivated instead.
   - Update `/admin/users` UI so delete controls are available for admin users where allowed.

5. **Verify deployed behavior**
   - Check recent Edge Function logs for `admin-create-user` and `admin-delete-user`.
   - Validate these flows after implementation:
     - create a staff/client/manager/admin user,
     - change admin → staff,
     - delete another admin when at least one admin remains,
     - confirm last-admin and self-delete protections still work.