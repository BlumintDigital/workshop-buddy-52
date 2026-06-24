## Goal

Today, when the super-admin sends a "notice" through this workshop's `admin-api` (`POST ?action=notices`), it's delivered as a web-push only. If the user isn't subscribed or misses the push, the message is gone. We'll persist every notice into a new `system_notices` table on the workshop DB and render an in-app banner that reads from it, mirroring the existing `BroadcastBanner` pattern.

## 1. Database — new `system_notices` table

Migration creating:

- `id uuid pk`
- `title text not null`
- `message text`
- `url text` (optional click-through)
- `user_id uuid` nullable — when set, notice is targeted to one user; when null, it's global to the workshop
- `created_at timestamptz default now()`
- `expires_at timestamptz` nullable (defaults to NULL = never)

Standard GRANTs + RLS:
- `GRANT SELECT, INSERT, UPDATE, DELETE` to `service_role` (edge function writes).
- `GRANT SELECT` to `authenticated`.
- Policy: authenticated users can `SELECT` a row when `user_id IS NULL` OR `user_id = auth.uid()`.
- No INSERT/UPDATE/DELETE policies for `authenticated` — only the edge function (service role) writes.
- Add table to `supabase_realtime` publication so the banner updates live.

## 2. Edge function — `admin-api` notices POST

In `supabase/functions/admin-api/index.ts`, inside `case "notices"` → `POST` branch, insert a `system_notices` row **before** the push loop:

```ts
await supabase.from("system_notices").insert({
  title,
  message: message ?? null,
  url: notifUrl ?? null,
  user_id: targetUserId ?? null,
});
```

Return value extended with `persisted: true` so the super-admin UI can confirm. Push delivery behavior is unchanged.

## 3. Frontend — `SystemNoticesBanner` component

New file `src/components/SystemNoticesBanner.tsx`, structurally identical to `BroadcastBanner`:

- On mount, query `system_notices` where `expires_at IS NULL OR expires_at > now()`, ordered by `created_at desc`, limit 10. RLS automatically filters to global + own notices.
- Subscribe to `postgres_changes` on `public.system_notices` (INSERT/UPDATE/DELETE) inside a `useEffect` with proper `removeChannel` cleanup.
- Per-device dismissal: store dismissed ids in `localStorage` under key `dismissed-system-notices` (separate from broadcasts), filter them out with `useMemo`.
- Render each active notice as a shadcn `<Alert>` with a `Bell` icon (info styling — these are operational notifications, not severity-tiered). Optional `url` becomes a link in the description. Dismiss `×` button in the top-right, same styling as BroadcastBanner (`opacity-70 hover:opacity-100`).

## 4. Mount in layout

Add `<SystemNoticesBanner />` in `src/components/layout/DashboardLayout.tsx` directly below the existing `<BroadcastBanner />` so both banner stacks appear at the top of every authenticated page.

## Technical notes

- No changes to the super-admin side — they keep calling the same `POST ?action=notices` endpoint; the workshop simply records what it receives.
- Notices and broadcasts stay separate tables: broadcasts are authored on the workshop's own admin UI; notices are pushed in from outside. Different lifecycles, different dismissal storage keys.
- `src/integrations/supabase/types.ts` regenerates after the migration, so the banner can drop the `as any` casts.
