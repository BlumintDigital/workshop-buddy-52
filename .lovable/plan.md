

## Plan: Exclude clients from AdminUsers page

### Problem
The AdminUsers page currently lists all users including clients. Clients should only appear on the dedicated AdminClients page.

### Changes

**File: `src/pages/admin/AdminUsers.tsx`**
- In `fetchUsers`, filter out client roles by changing the query from:
  ```ts
  supabase.from("user_roles").select("user_id, role")
  ```
  to:
  ```ts
  supabase.from("user_roles").select("user_id, role").in("role", ["admin", "manager", "staff"])
  ```
- Remove the "client" option from the role filter dropdown
- Remove the "client" option from the role change dropdown (so you can't change someone to client from this page)

**File: `src/pages/admin/AdminUserDetail.tsx`** (optional)
- No changes needed; it works for any user ID passed to it.

### Summary
One file changed (`AdminUsers.tsx`), three small edits: query filter, role filter dropdown, and role change dropdown.

