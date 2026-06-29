DROP POLICY IF EXISTS "select_job_comments" ON public.job_comments;

CREATE POLICY "select_job_comments" ON public.job_comments
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_comments.job_id
        AND j.assigned_staff_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_comments.job_id
      AND j.client_id = auth.uid()
  )
);