# Super-admin broadcast banner

Show notices sent from the super-admin as a dismissible banner at the top of every authenticated page. Each broadcast stays visible until the user dismisses it (per-device) or it expires.

## What gets built

### 1. `broadcasts` table (new)

Stores notices authored by the super-admin. All authenticated tenant users can read active ones; only `service_role` (admin-api edge function) can write.

Columns (domain-specific): `title`, `message`, `severity` (`info` | `warning` | `critical`), `link_url`, `link_label`, `active`, `starts_at`, `expires_at`.

Access rules:
- Authenticated users can read rows where `active = true` AND `starts_at <= now()` AND (`expires_at` IS NULL OR `expires_at > now()`).
- No client writes — inserts/updates/deletes go through the admin-api edge function with the service role.

Realtime is enabled so banners appear/disappear without a refresh.

### 2. `admin-api` edge function — new `broadcasts` action

Super-admin–only (already gated by `GLOBAL_ADMIN_SECRET`):
- `GET    ?action=broadcasts` — list all broadcasts (active + historical).
- `POST   ?action=broadcasts` — create one (`title`, `message`, `severity`, `link_url`, `link_label`, `expires_at`).
- `PATCH  ?action=broadcasts&id=<id>` — toggle `active` or update fields.
- `DELETE ?action=broadcasts&id=<id>` — remove.

No tenant-facing UI for composing — the user said the super-admin already sends them; this scope is display only. The endpoints are added so the super-admin tooling has something to call.

### 3. Banner UI in the app shell

New component `src/components/BroadcastBanner.tsx`:
- Subscribes to `broadcasts` via Supabase and filters to currently-active rows.
- Renders a sticky bar at the very top of `DashboardLayout`, above the existing header.
- Styling tied to `severity`: `info` uses muted/primary tokens, `warning` uses an amber/warning token, `critical` uses destructive tokens. All colors come from semantic tokens in `index.css` — no hard-coded hex.
- Optional CTA button rendered from `link_label` + `link_url` (internal links use `react-router` `Link`, external open in a new tab with `rel="noopener"`).
- Dismiss "×" button stores the broadcast id in `localStorage` under `dismissed-broadcasts`. Dismissed ids are filtered out. New broadcasts (new ids) appear automatically.
- If multiple broadcasts are active, the highest-severity one renders first; the rest stack below it (max 3 visible).

Hook it into `DashboardLayout` so every authenticated route shows it. Public routes (auth pages) are unchanged.

## Technical notes

- Migration follows the required order: `CREATE TABLE` → `GRANT SELECT` to `authenticated`, `GRANT ALL` to `service_role` (no `anon`) → `ENABLE ROW LEVEL SECURITY` → policies → `ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts`.
- Realtime subscription lives inside a `useEffect` with `supabase.removeChannel` cleanup.
- Banner is mobile-friendly: text truncates with a "Read more" expand on small screens; min 44px tap target on dismiss/CTA.
- No changes to existing `notices`/push pipeline — broadcasts are independent of Web Push.

## Out of scope

- Super-admin compose UI inside this app (admin-api endpoints only).
- Per-user read receipts in the database (dismissal is local to the device).
- Email/push fan-out from broadcasts.
