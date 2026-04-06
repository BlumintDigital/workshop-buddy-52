-- Allow staff to view all jobs in the organisation (not just their assigned ones).
-- Staff can still only UPDATE jobs assigned to them (existing policy unchanged).

DROP POLICY IF EXISTS "Staff can view assigned jobs" ON public.jobs;

CREATE POLICY "Staff can view all jobs"
  ON public.jobs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'staff'));
