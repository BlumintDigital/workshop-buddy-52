

## Add Optional Password to ensure-super-admin

### Change
Update the `ensure-super-admin` case in `supabase/functions/admin-api/index.ts` to accept an optional `password` field in the request body. When provided, the user is created with that password so they can log in via email/password instead of needing a magic link.

### File: `supabase/functions/admin-api/index.ts`

**Line 595** — Destructure `password` from the body alongside `email` and `full_name`.

**Line 613-617** — When creating a new user, conditionally include `password` in the `createUser` call:
```ts
const createOpts: any = {
  email,
  email_confirm: true,
  user_metadata: { full_name: full_name?.trim() || "Super Admin" },
};
if (password && typeof password === "string" && password.length >= 6) {
  createOpts.password = password;
}
```

**Line 610 (existing user branch)** — If a password is provided and the user already exists, update the user's password via `auth.admin.updateUserById()`:
```ts
if (password && typeof password === "string" && password.length >= 6) {
  await supabase.auth.admin.updateUserById(userId, { password });
}
```

### No other files need changes
The rest of the flow (role assignment, `is_super_admin` flag, response shape) stays the same.

