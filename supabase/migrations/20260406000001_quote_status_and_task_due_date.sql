-- Add 'quote' to jobs status constraint
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check,
  ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('quote','pending','in_progress','review','completed','cancelled'));

-- Add due_date and order_index to job_tasks
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.job_tasks ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
