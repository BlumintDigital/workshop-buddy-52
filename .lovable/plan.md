## Goal
Split the full-width "Live Activity Feed" tile on the Admin Dashboard into a two-column row, with the feed on the left and a new "Pending Actions" panel on the right.

## Changes

### 1. `src/pages/admin/AdminDashboard.tsx`
- Wrap the existing `ActivityFeed` in a 2-column grid (`grid grid-cols-1 lg:grid-cols-2 gap-4`) so it stacks on mobile and sits side-by-side on desktop.
- Drop in a new `<PendingActions />` component as the second column.

### 2. New `src/components/dashboard/PendingActions.tsx`
A pastel `Card` matching the feed's tone, titled "Pending actions" with subtitle "Items that need your attention." Fetches counts in parallel and renders a list of clickable rows. Each row: icon, label, count badge, chevron — navigates to the relevant admin page.

Rows (hidden when count is 0, plus an empty state if all clear):
- Jobs awaiting review — `jobs` where `status = 'pending_review'` → `/admin/jobs?status=pending_review`
- Overdue invoices — `invoices` where `status != 'paid'` and `due_date < now()` → `/admin/invoices?filter=overdue`
- Low stock items — `inventory_items` where `quantity <= reorder_level` → `/admin/inventory?filter=low`
- Pending user invites — `profiles` where `invited_at is not null and invite_accepted_at is null` → `/admin/users?filter=pending`
- Open bug reports — `bug_reports` where `status = 'open'` → `/admin/bug-reports` (only if route exists; otherwise omit)

Use `Promise.all` with head-count queries (`{ count: 'exact', head: true }`). Refresh on window focus + 60s polling, mirroring `ActivityFeed`. Loading skeleton while counts resolve.

### Out of scope
- No backend/RLS changes (existing admin policies already permit these reads).
- No changes to manager/staff/client dashboards.
- No new routes or filters wired beyond passing query params already supported.
