## Problem

Dismissing a system notice on the dashboard doesn't persist — after reload, the banner reappears.

**Root cause:** `public.dismissed_notices` has RLS policies but **no table-level GRANTs**, so PostgREST rejects the insert (and the subsequent select on reload returns nothing). The current dismiss handler also fires the insert without `await` or error handling, so the failure is silent — the optimistic UI hides it until reload. The same gap exists on `public.dismissed_broadcasts`, so broadcast dismissals from the BroadcastBanner share the same bug.

## Fix

1. **Migration** — grant the right privileges so authenticated users can persist their own dismissals:
   ```sql
   GRANT SELECT, INSERT ON public.dismissed_notices    TO authenticated;
   GRANT ALL              ON public.dismissed_notices    TO service_role;
   GRANT SELECT, INSERT ON public.dismissed_broadcasts TO authenticated;
   GRANT ALL              ON public.dismissed_broadcasts TO service_role;
   ```
   (No DELETE/UPDATE: dismissals are write-once. RLS policies already scope to `auth.uid()`.)

2. **`src/components/SystemNoticesBanner.tsx`** — `await` the insert in `dismiss()`, and on error roll back the optimistic state and show a toast so future failures surface.

3. **`src/components/BroadcastBanner.tsx`** — apply the same `await` + error-rollback pattern for consistency.

## Verification

- Send a notice via admin-api, dismiss it, reload — it should stay dismissed.
- Confirm a row appears in `dismissed_notices` for the current user.
- Repeat with a broadcast to confirm `dismissed_broadcasts` works.