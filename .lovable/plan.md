
## Goal

Eliminate horizontal scrolling on the three admin pages. On mobile (<sm), render each row as a self-contained card that fits the viewport width. On desktop (≥sm), keep the existing tables unchanged.

## Pages & changes

### 1. `src/pages/admin/AdminJobs.tsx`
- Remove the `overflow-x-auto` wrapper and the `min-w-[520px]` constraint on the `Table`.
- Wrap the `<Table>` in a `hidden sm:block` container so it only renders on desktop.
- Add a new mobile list (`sm:hidden`) that maps each job to a `Card`/`<Link>` block showing: title (truncated, wrapping allowed), status + priority badges in a row, staff/client lines, created date — all stacked vertically with `flex flex-col gap-1` and `p-4`.
- Skeleton state on mobile: render 6 stacked skeleton blocks instead of skeleton table rows.

### 2. `src/pages/admin/AdminSignupCodes.tsx`
- Same dual-rendering pattern. Keep desktop table; remove the `overflow-x-auto` + `min-w-[860px]`.
- Mobile card per code: top row = `code` (mono, truncated) + status badge; second row = role badge + uses (e.g., `2 / 10`); third row = label + expiry; bottom row = action buttons (Switch, Copy, Delete) aligned right.
- Update loading skeletons to stacked cards on mobile.
- Update the empty state to render once for both layouts.

### 3. `src/pages/admin/AdminAccessReview.tsx`
- Same dual pattern. Desktop table unchanged.
- Mobile card per user: name + Inactive badge on first line; role + status (Stale/Active) badges on second; "Last sign-in" line; action buttons (Deactivate, Remove role) wrapped to a new row with `flex-wrap`.
- Stale rows keep the amber background class on the card.
- Skeleton: 6 stacked skeleton cards.

## Out of scope

No changes to data fetching, filters, dialogs, or desktop styling. No new components extracted — inline JSX is fine given the limited scope.
