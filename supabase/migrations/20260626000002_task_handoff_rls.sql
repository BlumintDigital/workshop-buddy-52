-- Allow an assigned staff member to update their own task status.
-- Admin and manager task policies remain unchanged.
DROP POLICY IF EXISTS "Assigned staff can update own task status" ON public.job_tasks;
CREATE POLICY "Assigned staff can update own task status"
ON public.job_tasks
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'staff'::public.app_role)
  AND assigned_to = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'staff'::public.app_role)
  AND assigned_to = auth.uid()
  AND status IN ('pending', 'in_progress', 'completed')
);

-- Allow an assigned staff member to complete a task and hand it off to another staff user.
-- Admin and manager task policies remain unchanged.
DROP POLICY IF EXISTS "Assigned staff can complete and hand off own task" ON public.job_tasks;
CREATE POLICY "Assigned staff can complete and hand off own task"
ON public.job_tasks
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'staff'::public.app_role)
  AND assigned_to = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'staff'::public.app_role)
  AND status = 'completed'
  AND assigned_to IS NOT NULL
  AND assigned_to <> auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = job_tasks.assigned_to
      AND user_roles.role = 'staff'::public.app_role
  )
);
