

## Plan: Enhanced Calendar with Project Planning Features

### Current State
The calendar already fetches both appointments and jobs (by `due_date`). But it's read-only with minimal job detail.

### Enhancements

**1. Richer job data on the calendar** (extend the query)
- Fetch `priority`, `assigned_staff_id`, `client_id`, `estimated_hours`, `created_at` from jobs
- Join profiles for assigned staff name and client name
- Show priority color-coding on calendar cells (high=red, medium=amber, low=green)

**2. Filter/toggle bar above the calendar**
- Toggle buttons to show/hide: Appointments, Jobs
- Filter by job status: All, Pending, In Progress, Completed
- Filter by priority: All, High, Medium, Low

**3. Enhanced event detail panel (when a date is selected)**
- For jobs: show priority badge, assigned staff, client name, estimated hours, status with color
- For appointments: show time, type, client
- Add a "View Details" link that navigates to `/admin/jobs/{id}` or appointment detail
- Add a quick "Create Job" button on the selected date panel that links to job creation

**4. Visual improvements to calendar cells**
- Color-coded left border on event pills: blue for appointments, priority-colored for jobs
- Show job count + appointment count summary in each cell header

**5. Month summary stats row**
- Small stats bar above calendar: total jobs this month, total appointments, overdue jobs count

### Files Changed

**`src/pages/admin/AdminCalendar.tsx`** - Full rewrite with:
- Extended `CalendarEvent` type to include `priority`, `staffName`, `clientName`, `estimatedHours`
- Filter state and toggle UI
- Richer detail panel with navigation links
- Summary stats row
- Priority color-coding throughout

No database changes needed -- all data already exists in the `jobs` and `appointments` tables.

### Technical Details
- Jobs query becomes: `supabase.from("jobs").select("id, title, due_date, status, priority, estimated_hours, assigned_staff_id, client_id, created_at")`
- Separate queries to `profiles` to resolve staff/client names (batch by IDs)
- Filter logic is client-side on the already-fetched events array
- Links use `react-router-dom` `Link` component to `/admin/jobs/{id}`

