

## Plan: Week View Toggle + Create Job from Calendar

### Changes

**`src/pages/admin/AdminCalendar.tsx`** -- single file, two features added:

#### 1. Week View Toggle
- Add `viewMode` state: `"month" | "week"` (default `"month"`)
- Add a toggle group next to the month navigation header: "Month" / "Week"
- In week mode:
  - Track a `currentWeek` date (any day in the selected week)
  - Use `startOfWeek` / `endOfWeek` from date-fns to compute the 7-day range
  - Render a 7-column grid with taller day cells (~200px min-height) showing ALL events for each day (no "+N more" truncation)
  - Each day cell shows the full date header (e.g. "Mon, Mar 30")
  - Navigation arrows move by week instead of month
  - Data fetching adjusts date range to the current week boundaries
  - Drag-and-drop works identically in week view

#### 2. Create Job Dialog (inline on calendar)
- Add a "Create Job" dialog directly in the calendar page (replicating the form pattern from `AdminJobs.tsx`)
- When clicking the "+" button on a day cell or the "Create Job" button in the selected-day panel, open the dialog with `due_date` pre-filled to that date
- Dialog form fields: title, description, priority, assigned staff, client, due date (pre-filled), quote checkbox
- On submit: insert into `jobs` table, show toast, refresh events, close dialog
- Fetch staff/client user lists on dialog open (same pattern as AdminJobs)

### Technical Details
- New imports: `startOfWeek`, `endOfWeek`, `addWeeks`, `subWeeks`, `addDays` from date-fns
- New imports: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from ui
- New imports: `Input`, `Label`, `Textarea`, `Checkbox` from ui
- The `useEffect` for fetching events will compute start/end based on `viewMode` -- either month boundaries or week boundaries
- A small "+" icon button appears in each day cell header (both views) to quick-create a job for that date
- The existing "Create Job" link in the detail panel becomes a button that opens the dialog instead of navigating away

### No database changes needed

