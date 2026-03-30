

## Multi-Feature Implementation Plan

This is a large set of 7 features. Below is the full plan organized by workstream.

---

### Database Changes (Migration)

**1. Add `stripe_payment_url` column to `invoices` table**
```sql
ALTER TABLE public.invoices ADD COLUMN stripe_payment_url text;
```

**2. Create DB trigger: auto-create draft invoice when job status becomes "completed"**
```sql
CREATE OR REPLACE FUNCTION public.create_invoice_on_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.invoices (invoice_number, client_id, job_id, status, subtotal, tax_rate, tax_amount, total)
    VALUES (
      'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 4),
      NEW.client_id,
      NEW.id,
      'draft',
      0, 0, 0, 0
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_completed_create_invoice
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_invoice_on_job_completed();
```

**3. Create three RPC functions for admin reports**
```sql
-- Monthly bookings (appointments per month)
CREATE OR REPLACE FUNCTION public.get_monthly_bookings()
RETURNS TABLE(month text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(appointment_date, 'YYYY-MM') AS month, count(*)
  FROM appointments
  WHERE appointment_date >= (now() - interval '12 months')
  GROUP BY month ORDER BY month;
$$;

-- Monthly revenue (paid invoices per month)
CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS TABLE(month text, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(paid_at, 'YYYY-MM') AS month, sum(total) AS revenue
  FROM invoices
  WHERE status = 'paid' AND paid_at >= (now() - interval '12 months')
  GROUP BY month ORDER BY month;
$$;

-- Job completion rate
CREATE OR REPLACE FUNCTION public.get_job_completion_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status, count(*) FROM jobs GROUP BY status;
$$;
```

---

### Feature 1: Staff Kanban Board

**New file: `src/pages/staff/StaffKanban.tsx`**
- Three columns: Todo (status=pending), In Progress (status=in_progress), Done (status=completed)
- Fetch jobs from Supabase filtered by `assigned_staff_id = user.id`
- Use HTML5 drag-and-drop (onDragStart/onDragOver/onDrop) -- no extra library needed
- On drop, update `jobs.status` in Supabase and optimistically move the card
- Each card shows title, priority badge, due date

**Update `src/components/layout/AppSidebar.tsx`**: Add "Kanban" nav item for staff role pointing to `/staff/kanban`

**Update `src/App.tsx`**: Add route `/staff/kanban` with `ProtectedRoute allowedRoles={["staff"]}`

---

### Feature 2: Jobs List with Status Filter + Job Detail Page

**New file: `src/pages/jobs/JobsList.tsx`**
- Shared component used by admin/manager/staff routes
- Status filter tabs: All, Pending, In Progress, Completed (maps to DB statuses)
- Each row links to `/jobs/:id` detail page
- Manager/admin: show "New Job" and "Edit" buttons; staff: read-only view of assigned jobs
- Props: `canCreate`, `canEdit`, `filterByStaff` to control behavior per role

**New file: `src/pages/jobs/JobDetail.tsx`**
- Fetch single job by ID with profile lookups for staff/client names
- Show all fields, job updates timeline
- Manager/admin can edit status, priority, assignment inline
- Staff sees read-only view

**Update routes in `App.tsx`**:
- `/admin/jobs` and `/manager/jobs` use JobsList with canCreate/canEdit
- `/staff/jobs` uses JobsList with filterByStaff
- `/jobs/:id` detail route accessible by admin, manager, staff, client (RLS handles visibility)

---

### Feature 3: Invoice Creation Page

**New file: `src/pages/invoices/InvoiceCreate.tsx`** at route `/invoices/new`
- Optional `?jobId=` query param to pre-populate from a linked job
- When jobId provided: fetch job + client profile, pre-fill client_id, title as line item description
- Line items editor: add/remove rows with description, quantity, unit_price, auto-calc total
- Tax rate input, auto-calc subtotal/tax/total
- Generates invoice_number as `INV-YYYYMMDD-XXXX`
- Saves to `invoices` + `invoice_items` tables with status "draft"
- Admin can change status to sent/paid/overdue via a dropdown on existing invoices

**Update `AdminInvoices.tsx`**: Add "New Invoice" button linking to `/invoices/new`, add status change dropdown per row

**Update routes in `App.tsx`**: Add `/invoices/new` route for admin/manager

---

### Feature 4: DB Trigger for Auto-Invoice

Handled entirely in the migration above. No frontend code needed -- the trigger fires server-side when any update sets `jobs.status = 'completed'`.

---

### Feature 5: Admin Reports Dashboard

**New file: `src/pages/admin/AdminReports.tsx`** at route `/admin/reports`
- Three charts using recharts (already installed):
  1. Monthly Bookings -- `BarChart` fed by `get_monthly_bookings()` RPC
  2. Revenue -- `LineChart` fed by `get_monthly_revenue()` RPC  
  3. Job Completion Rate -- `PieChart` (donut) fed by `get_job_completion_stats()` RPC
- Date range filter (last 3/6/12 months) for bookings and revenue

**Update sidebar**: Add "Reports" nav item for admin role

**Update `App.tsx`**: Add `/admin/reports` route

---

### Feature 6: CSV Export on Reports Page

**Add to `AdminReports.tsx`**:
- "Export CSV" button next to each chart
- On click, query Supabase for the same data, format as CSV string, trigger browser download via `Blob` + `URL.createObjectURL` + hidden anchor click
- One utility function `downloadCSV(filename, headers, rows)` shared across exports

---

### Feature 7: Client Invoice Page with Pay Now

**Update `src/pages/client/ClientInvoices.tsx`**:
- Already fetches client's invoices -- enhance the table to show invoice_number, total, due_date, status
- Add "Pay Now" button per row that opens `invoice.stripe_payment_url` in a new tab (only shown when URL exists and status is not "paid")
- Style paid invoices with a green badge, overdue with red

---

### Files Summary

| Action | File |
|--------|------|
| Migration | Add column, trigger, 3 RPC functions |
| Create | `src/pages/staff/StaffKanban.tsx` |
| Create | `src/pages/jobs/JobsList.tsx` |
| Create | `src/pages/jobs/JobDetail.tsx` |
| Create | `src/pages/invoices/InvoiceCreate.tsx` |
| Create | `src/pages/admin/AdminReports.tsx` |
| Create | `src/lib/csv.ts` (CSV download utility) |
| Update | `src/App.tsx` (new routes) |
| Update | `src/components/layout/AppSidebar.tsx` (nav items) |
| Update | `src/pages/admin/AdminInvoices.tsx` (new invoice button, status change) |
| Update | `src/pages/client/ClientInvoices.tsx` (Pay Now button) |
| Update | `src/pages/staff/StaffJobs.tsx` (link rows to detail) |

