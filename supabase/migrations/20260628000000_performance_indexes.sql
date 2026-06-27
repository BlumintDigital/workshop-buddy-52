-- Performance indexes: cover the most frequently filtered/sorted columns.
-- Every query filtering by these FK/status columns currently does a full table scan.

-- Jobs (most-queried table)
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_staff_id ON public.jobs(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id         ON public.jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status            ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at        ON public.jobs(created_at DESC);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_client_id     ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status        ON public.invoices(status);

-- Appointments
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status    ON public.appointments(status);

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inv_tx_item_id         ON public.inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_user_id         ON public.inventory_transactions(user_id);

-- Job sub-tables
CREATE INDEX IF NOT EXISTS idx_job_attachments_job_id ON public.job_attachments(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_job_id       ON public.job_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_job_tasks_assigned_to  ON public.job_tasks(assigned_to);

-- RLS: has_role() scans user_roles on every policy evaluation.
-- Composite index makes each call O(log n) instead of a sequential scan.
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role ON public.user_roles(user_id, role);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON public.notifications(user_id);
