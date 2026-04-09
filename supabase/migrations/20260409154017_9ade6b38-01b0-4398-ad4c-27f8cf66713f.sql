CREATE TABLE public.bug_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  page_url text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins manage bug reports"
  ON public.bug_reports FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Managers can view all reports
CREATE POLICY "Managers view bug reports"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

-- Any authenticated user can submit a report
CREATE POLICY "Users can submit bug reports"
  ON public.bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own reports
CREATE POLICY "Users can view own bug reports"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);