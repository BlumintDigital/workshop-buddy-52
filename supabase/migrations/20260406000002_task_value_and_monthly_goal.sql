-- Monetary value per task (set by admin/manager, contributes to monthly goal when completed)
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS value NUMERIC(10,2) DEFAULT 0;

-- Company monthly revenue goal stored in workshop_settings
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS monthly_goal NUMERIC(10,2);
