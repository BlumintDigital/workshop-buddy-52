

## Enable Super Admin Instance Login

### Approach
Add two new `admin-api` endpoints that let the Global Admin Dashboard provision and authenticate a super admin account on any instance.

### New endpoints

**1. `POST ?action=ensure-super-admin`**
- Accepts `{ email, full_name }` in the body
- Uses service-role client to check if user with that email exists
- If not, creates the user via `auth.admin.createUser()` with `email_confirm: true`
- Ensures the user has `admin` role in `user_roles`
- Returns `{ user_id, email, created: true/false }`

**2. `POST ?action=generate-login-link`**
- Accepts `{ email }` in the body
- Uses `auth.admin.generateLink({ type: 'magiclink', email })` to create a one-time login URL
- Returns `{ link }` — the dashboard opens this in a new tab, logging the super admin directly into the instance UI
- No password needed; link expires after single use

### Security
- Both endpoints remain behind `GLOBAL_ADMIN_SECRET` auth
- The magic link is single-use and short-lived (Supabase default: 1 hour)
- No passwords are stored or shared across instances

### File to modify
`supabase/functions/admin-api/index.ts` — add two new `case` blocks

### Flow from the Global Admin Dashboard
1. Dashboard calls `ensure-super-admin` with the super admin's email
2. Dashboard calls `generate-login-link` with that email
3. Dashboard opens the returned link in a new browser tab
4. Super admin lands on the instance, fully authenticated as admin

