

## Global Admin Dashboard — Architecture Plan

### Overview

Build a **separate Lovable project** with its own **central Supabase project** that acts as a command center for managing multiple deployed workshop instances. Each deployed instance exposes a set of Edge Function endpoints (a REST API), and the global dashboard calls them to read stats, push config, and manage users/data.

### Architecture

```text
┌──────────────────────────────┐
│   Global Admin Dashboard     │
│   (new Lovable project)      │
│   + Central Supabase DB      │
│                              │
│  Tables:                     │
│   - instances (registry)     │
│   - admin_users              │
│   - audit_log                │
└──────────┬───────────────────┘
           │  REST calls (JWT / shared secret)
     ┌─────┴─────┬─────────────┐
     ▼           ▼             ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Instance A│ │Instance B│ │Instance C│
│(Company) │ │(Company) │ │(Company) │
│Supabase  │ │Supabase  │ │Supabase  │
└──────────┘ └──────────┘ └──────────┘
```

### What needs to happen in TWO projects

---

#### A. Changes to THIS project (each deployed instance)

Add an Edge Function `admin-api` that the global dashboard calls. It validates a shared secret, then performs actions:

1. **`GET /admin-api?action=stats`** — returns job count, user count, appointment count, invoice count, inventory count, low-stock count
2. **`GET /admin-api?action=config`** — returns current `workshop_settings`
3. **`POST /admin-api?action=update-config`** — updates `workshop_settings` (name, branding, currency, tax rate, notifications)
4. **`GET /admin-api?action=users`** — lists users with roles
5. **`POST /admin-api?action=update-role`** — changes a user's role
6. **`POST /admin-api?action=toggle-user`** — activate/deactivate a user
7. **`POST /admin-api?action=seed-data`** / **`delete-data`** — proxy to existing Edge Functions
8. **`GET /admin-api?action=health`** — simple health check / version ping

Auth: a `GLOBAL_ADMIN_SECRET` stored as a Supabase secret, validated via `Authorization: Bearer <secret>` header. The Edge Function uses the service role key internally.

---

#### B. New Lovable project (Global Admin Dashboard)

**Central Supabase tables:**

- **`instances`** — `id`, `name`, `company_name`, `supabase_url`, `api_secret`, `status`, `created_at`, `last_health_check`, `version`
- **`admin_users`** — global admin accounts (email/password via Supabase Auth)
- **`audit_log`** — tracks all actions taken from the dashboard (who, what instance, what action, when)

**Pages:**

1. **Dashboard** — grid of instance cards showing health, user/job counts, last checked
2. **Instance Detail** — stats, config editor, user list, data management actions
3. **Add Instance** — form to register a new deployment (URL + API secret)
4. **Audit Log** — filterable log of all global admin actions
5. **Settings** — manage global admin users

**Key frontend patterns:**
- Each instance card polls `/admin-api?action=health` periodically
- Instance detail page fetches stats + config on load
- Config editor sends `update-config` calls
- User table supports role changes and activation toggles
- All mutations log to the central `audit_log`

---

### Implementation order

1. **This project first**: Create the `admin-api` Edge Function with all endpoints and the `GLOBAL_ADMIN_SECRET`
2. **New project**: Set up the central Supabase schema, then build the dashboard UI

### Security considerations

- The shared secret is per-instance (stored in each instance's Supabase secrets and in the central DB)
- The Edge Function uses service role internally — never exposed to the client
- All actions are audit-logged centrally
- The global dashboard itself uses Supabase Auth for admin login

---

### Scope for this session

Since this is a separate project, I recommend we start by **adding the `admin-api` Edge Function to this project** so each deployment is ready to be managed. The new dashboard project would then be created separately.

Shall I proceed with building the `admin-api` Edge Function in this project first?

