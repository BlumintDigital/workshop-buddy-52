
-- 1. Fix job_tasks: Replace overly permissive SELECT policy with scoped ones
DROP POLICY IF EXISTS "authenticated can view job tasks" ON public.job_tasks;

-- Clients can only view tasks for their own jobs
CREATE POLICY "Clients can view own job tasks"
ON public.job_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_tasks.job_id AND jobs.client_id = auth.uid()
  )
);

-- Staff can view tasks for jobs assigned to them
CREATE POLICY "Staff can view assigned job tasks"
ON public.job_tasks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs
    WHERE jobs.id = job_tasks.job_id AND jobs.assigned_staff_id = auth.uid()
  )
  OR assigned_to = auth.uid()
);

-- Admins and managers already have ALL policies, no change needed

-- 2. Fix manager privilege escalation: prevent managers from targeting admin rows
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can delete roles" ON public.user_roles;

CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role)
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

CREATE POLICY "Managers can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- 3. Fix storage delete policy: add admin/manager/ownership check
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;

CREATE POLICY "Users can delete own uploads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND (
    -- Admins and managers can delete any file
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    -- Owner check: the file path starts with auth.uid
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);
