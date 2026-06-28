## Plan

1. **Harden the app shell for mobile widths**
   - Update `DashboardLayout` so the sidebar/content flex layout cannot force horizontal overflow.
   - Add `min-w-0`, `max-w-full`, and appropriate `overflow-x-hidden` guards to the main content wrapper.
   - Keep vertical scrolling intact and avoid clipping page content horizontally.

2. **Make dashboard cards fit on narrow screens**
   - Adjust `StatCard` spacing, text sizing, icon sizing, and wrapping so values and labels remain visible on mobile.
   - Add `min-w-0`/`max-w-full` guards to dashboard grids so charts and cards do not push outside the viewport.
   - Tighten dashboard child cards (`RecentActivity`, `ActivityFeed`, `JobStatusChart`) where long labels or badges can cause overflow.

3. **Stabilize jobs page during loading**
   - Give the jobs table a stable minimum width inside an `overflow-x-auto` container so columns scroll instead of overlapping.
   - Match skeleton row visibility to the responsive columns to prevent the initial loading state from being wider/misaligned than the final table.
   - Make pagination wrap cleanly on mobile.

4. **Fix Access Review mobile clipping**
   - Wrap its table in a horizontal scroll container with stable table width.
   - Make the page header/actions stack cleanly on mobile.
   - Prevent action buttons and badges from squeezing into overlapping rows.

5. **Fix Signup Invite Codes mobile overlap**
   - Keep its table inside a proper mobile scroll container with a stable table width.
   - Make the header action buttons and create-code dialog controls wrap/stack on small screens.
   - Prevent long codes/labels/dates from expanding the viewport.

6. **Verify in mobile viewport**
   - Check the affected pages at mobile size after implementation: dashboard, jobs, access review, and signup codes.
   - Confirm cards are fully visible, tables scroll horizontally where needed, and loading states no longer briefly overlap.