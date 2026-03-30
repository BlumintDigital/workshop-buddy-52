

## Plan: Three Enhancements

### 1. Staff & Client Assignment in Job Creation Form

**What**: Add two dropdown selects to the job creation dialog in `AdminJobs.tsx` — one for assigning a staff member, one for assigning a client.

**How**:
- On dialog open, fetch staff users via `user_roles` joined with `profiles` where `role = 'staff'`, and client users where `role = 'client'`
- Add two `Select` fields: "Assign Staff" and "Assign Client" (both optional)
- Include `assigned_staff_id` and `client_id` in the insert payload
- Show assigned staff/client names in the jobs table (join profiles on fetch)
- Since `ManagerJobs` re-exports `AdminJobs`, managers get this automatically

**Files changed**: `src/pages/admin/AdminJobs.tsx`

---

### 2. Job Status Distribution Chart on Admin Dashboard

**What**: Add a pie/bar chart showing counts per job status (pending, in_progress, review, completed, cancelled) using recharts.

**How**:
- Fetch all jobs and group by status (or fetch with a count query per status)
- Create a `JobStatusChart` component using recharts `PieChart` (or `BarChart`) with colored segments matching status badge colors
- Place it in the dashboard grid next to the RecentActivity card
- recharts is already a project dependency

**Files changed**: `src/pages/admin/AdminDashboard.tsx`, new `src/components/dashboard/JobStatusChart.tsx`

---

### 3. Password Reset Flow

**What**: Add "Forgot password?" link on the login form, a forgot password page, and a `/reset-password` page.

**How**:
- **Auth.tsx**: Add a "Forgot password?" link below the sign-in button
- **ForgotPassword.tsx** (`/forgot-password`): Simple form that calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`
- **ResetPassword.tsx** (`/reset-password`): Listens for `PASSWORD_RECOVERY` event from `onAuthStateChange`, shows a new password form, calls `supabase.auth.updateUser({ password })`
- **App.tsx**: Add two new public routes: `/forgot-password` and `/reset-password`

**Files changed**: `src/pages/Auth.tsx`, new `src/pages/ForgotPassword.tsx`, new `src/pages/ResetPassword.tsx`, `src/App.tsx`

