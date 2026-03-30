
-- Create job_attachments table
CREATE TABLE public.job_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_attachments ENABLE ROW LEVEL SECURITY;

-- Admins/managers can manage all
CREATE POLICY "Admins manage job attachments" ON public.job_attachments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage job attachments" ON public.job_attachments FOR ALL
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Staff can view/insert for assigned jobs
CREATE POLICY "Staff view job attachments" ON public.job_attachments FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.assigned_staff_id = auth.uid()
  ));

CREATE POLICY "Staff insert job attachments" ON public.job_attachments FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) AND uploaded_by = auth.uid());

-- Clients can view/insert for own jobs
CREATE POLICY "Clients view job attachments" ON public.job_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.client_id = auth.uid()
  ));

CREATE POLICY "Clients insert job attachments" ON public.job_attachments FOR INSERT
  WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_attachments.job_id AND jobs.client_id = auth.uid()
  ));

-- Create job_task_notes table
CREATE TABLE public.job_task_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage task notes" ON public.job_task_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers manage task notes" ON public.job_task_notes FOR ALL
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff view task notes" ON public.job_task_notes FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM public.job_tasks jt JOIN public.jobs j ON j.id = jt.job_id
    WHERE jt.id = job_task_notes.task_id AND (jt.assigned_to = auth.uid() OR j.assigned_staff_id = auth.uid())
  ));

CREATE POLICY "Staff insert task notes" ON public.job_task_notes FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) AND user_id = auth.uid());

CREATE POLICY "Clients view task notes" ON public.job_task_notes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.job_tasks jt JOIN public.jobs j ON j.id = jt.job_id
    WHERE jt.id = job_task_notes.task_id AND j.client_id = auth.uid()
  ));

-- Create job_ratings table
CREATE TABLE public.job_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, client_id)
);

ALTER TABLE public.job_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view ratings" ON public.job_ratings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers view ratings" ON public.job_ratings FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff view ratings for assigned jobs" ON public.job_ratings FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) AND EXISTS (
    SELECT 1 FROM public.jobs WHERE jobs.id = job_ratings.job_id AND jobs.assigned_staff_id = auth.uid()
  ));

CREATE POLICY "Clients manage own ratings" ON public.job_ratings FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());
