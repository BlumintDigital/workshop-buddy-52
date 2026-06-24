# New Customer Deployment Guide

## Prerequisites

- Access to the GitHub repository
- [Supabase](https://supabase.com) account (one project per customer)
- [Resend](https://resend.com) account with a verified sender domain (for email)
- Supabase CLI installed: `npm install -g supabase`
- The `GLOBAL_ADMIN_SECRET` for the super admin command center

---

## Step 1 — Create a new Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name (e.g., `workshopbuddy-customername`)
3. Set a strong database password — **save it**, you'll need it
4. Select the region closest to the customer
5. Once the project is ready, note:
   - **Project ref** (e.g., `abcdefghijklmno`) — visible in the URL
   - **Project URL** — `https://<ref>.supabase.co`
   - **Anon key** — Settings → API → Project API Keys → `anon public`

---

## Step 2 — Apply the database schema

The `schema.sql` file in the project root is a consolidation of all migrations.

**Option A — Supabase Studio (recommended, no CLI needed)**
1. Open Supabase Studio for the new project
2. Go to **SQL Editor** → New query
3. Open `schema.sql` from the project root, copy all content
4. Paste and click **Run**
5. Confirm tables appear in **Table Editor**

**Option B — CLI (requires database password from Step 1)**
```bash
psql "postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres" -f schema.sql
```

**Option C — Supabase CLI (after linking)**
```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

---

## Step 3 — Set Supabase secrets

Run these from a terminal with the CLI linked to the new project:

```bash
# Required — used by the admin-api edge function
supabase secrets set GLOBAL_ADMIN_SECRET=<generate-a-strong-random-string>

# Required for email — get from Resend dashboard
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx

# Optional — set after Step 8 (push notifications)
# supabase secrets set VAPID_PRIVATE_KEY=<key>
```

> To generate a strong `GLOBAL_ADMIN_SECRET`:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Step 4 — Deploy edge functions

```bash
supabase functions deploy --project-ref <project-ref>
```

This deploys: `admin-api`, `send-email`, `seed-data`, `delete-data`, and all MFA functions.

---

## Step 5 — Configure the frontend environment

For **hosted deployments** (Netlify, Vercel, etc.), set these environment variables in the platform dashboard:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key from Step 1 |
| `VITE_SUPABASE_PROJECT_ID` | `<project-ref>` |

For a **self-hosted build**, copy `.env.example` to `.env.local`, fill in the values, then run:
```bash
npm run build
```

---

## Step 6 — Create the first admin user

Use the super admin command center to provision the customer's admin account:

```
POST https://<project-ref>.supabase.co/functions/v1/admin-api?action=ensure-super-admin
Authorization: Bearer <GLOBAL_ADMIN_SECRET>
Content-Type: application/json

{
  "email": "admin@customer.com",
  "full_name": "Admin Name",
  "password": "choose-a-strong-password"
}
```

This creates the user (if they don't exist), assigns the `admin` role, and marks them as super admin.

> **Manual alternative (Supabase Studio):**
> 1. Authentication → Users → Add user → Create new user
> 2. Table Editor → `user_roles` → find the user row → set `role` to `admin`

---

## Step 7 — Configure workshop settings

Log in as the admin and go to **Settings** to configure:

- Workshop name and logo
- Contact email, phone, address
- Currency and default tax rate

The footer is fixed ("Shoplane is powered by Blumint Workspace") — no settings needed.

---

## Step 8 — Set up email (Resend)

1. In the Resend dashboard, add and verify the customer's sender domain (e.g., `mail.customer.com`)
2. The `RESEND_API_KEY` was set in Step 3
3. In the app: **Settings → Email**
   - Set **From Email Address** to a verified address (e.g., `noreply@customer.com`)
   - Toggle **Email Notifications** on
4. All transactional emails (job status changes, invoices sent, appointment confirmations) will now fire automatically to clients

---

## Step 9 — Set up push notifications

1. From the super admin command center, call:
   ```
   GET https://<project-ref>.supabase.co/functions/v1/admin-api?action=generate_vapid
   Authorization: Bearer <GLOBAL_ADMIN_SECRET>
   ```
   Response includes `public_key` (saved automatically to the DB) and `private_key`.

2. Set the private key as a secret:
   ```bash
   supabase secrets set VAPID_PRIVATE_KEY=<private_key> --project-ref <project-ref>
   ```

3. Redeploy the admin-api function for the secret to take effect:
   ```bash
   supabase functions deploy admin-api --project-ref <project-ref>
   ```

4. Users will be prompted for browser notification permission on next login.

**Sending a push notification** (from super admin dashboard):
```
POST .../admin-api?action=notices
Authorization: Bearer <GLOBAL_ADMIN_SECRET>
{ "title": "Hello", "message": "Your job is ready", "url": "/jobs/123" }
```

**Managing subscribers:**
```
GET    .../admin-api?action=notices          → list all subscribers
DELETE .../admin-api?action=notices&id=<id> → remove a subscription
```

---

## Step 10 — Configure feature flags (optional)

By default all features are enabled. To hide a feature from this customer:

```
POST .../admin-api?action=set_feature_flags
Authorization: Bearer <GLOBAL_ADMIN_SECRET>
{
  "flags": {
    "goals": false,
    "client_portal": true,
    "reports": true,
    "appointments": true
  }
}
```

Available flags: `goals`, `client_portal`, `reports`, `appointments`

Flags are invisible to the admin — they only take effect silently in the UI and routing.

---

## Step 11 — Verify the deployment

Run a health check from the super admin dashboard:
```
GET .../admin-api?action=health
```

Expected response:
```json
{ "status": "ok", "version": "1.0.0", "workshop_name": "...", "timestamp": "..." }
```

Then do a quick smoke test:
- [ ] Log in as admin → dashboard loads
- [ ] Create a test job with a client → job appears
- [ ] Change job status → email arrives (if Resend is configured)
- [ ] Open site on mobile → install PWA prompt appears
- [ ] Check browser for notification permission prompt

---

## Updating `schema.sql` for future deployments

`schema.sql` is auto-generated from all files in `supabase/migrations/`. Regenerate it any time a new migration is added:

```bash
# From the project root (PowerShell)
$migrations = Get-ChildItem "supabase/migrations/*.sql" | Sort-Object Name
$body = $migrations | ForEach-Object { Get-Content $_.FullName -Raw }
$body -join "`n" | Out-File "schema.sql" -Encoding utf8
```

Or use the generate script:
```bash
# bash
cat supabase/migrations/*.sql > schema.sql
```

Commit `schema.sql` after every migration so it stays current.
