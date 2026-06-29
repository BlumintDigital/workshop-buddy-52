Remove the Active/Completed/All filter pill from the Admin Dashboard "Jobs" card so it just shows recent jobs.

### Changes (`src/pages/admin/AdminDashboard.tsx`)
- Delete the filter pill markup (the `inline-flex` with the three buttons) inside the Recent Jobs card.
- Remove the `jobsFilter` state and the filter branches in the recent-jobs query — fetch the latest 5 jobs unconditionally, ordered by `created_at desc`.
- Drop `setJobsFilter` from the effect deps.
- Restore the empty-state copy to "No jobs yet."

Manager, Staff, and Client dashboards keep their filters since this request targets only the home (admin) dashboard.