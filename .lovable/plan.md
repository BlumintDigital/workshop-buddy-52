

## Plan: Add Activity Feed Widget to Admin Dashboard

### What
Add a new "Activity Feed" card to the admin dashboard that shows the latest 5 entries from the `activity_logs` table, with real-time updates via Supabase Realtime subscription.

### Changes

**New file: `src/components/dashboard/ActivityFeed.tsx`**
- A Card component that fetches the 5 most recent `activity_logs` entries
- Subscribes to Supabase Realtime `INSERT` events on `activity_logs` to prepend new entries live
- Each entry shows: action badge (created/updated/deleted with color coding), summary text, relative timestamp (e.g. "2 min ago"), and table name
- Loading state with skeleton placeholders
- Link to `/admin/activity-logs` at bottom ("View all activity")

**Modified: `src/pages/admin/AdminDashboard.tsx`**
- Import and render `<ActivityFeed />` below the existing 2-column grid (JobStatusChart + RecentJobs)
- Layout: full-width card below the existing grid, or as a third row item

### Technical Details
- Query: `supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(5)`
- Realtime: `supabase.channel("activity-feed").on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, callback).subscribe()`
- Realtime requires enabling replication for the `activity_logs` table -- will need a migration to add it to the Supabase realtime publication
- Action badge colors reuse the same pattern from `AdminActivityLogs.tsx`
- Uses `formatDistanceToNow` from date-fns for relative timestamps
- Cleanup subscription on unmount

### Database Migration
Enable realtime for `activity_logs`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
```

### No comprehensive "test all pages" task
A full production audit is too broad for a single implementation step. The activity feed widget is a contained feature. If specific pages have issues, those should be reported individually.

