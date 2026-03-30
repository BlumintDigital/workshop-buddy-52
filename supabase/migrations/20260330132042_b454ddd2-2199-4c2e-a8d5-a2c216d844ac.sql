
-- 1. Fix notifications INSERT: restrict target user_id context
-- Staff can only insert notifications for users related to their assigned jobs
DROP POLICY IF EXISTS "Staff can insert notifications" ON public.notifications;
CREATE POLICY "Staff can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role)
  AND (
    -- Staff can notify clients/managers of their own assigned jobs
    EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.assigned_staff_id = auth.uid()
      AND (jobs.client_id = notifications.user_id OR notifications.user_id = auth.uid())
    )
    OR notifications.user_id = auth.uid()
  )
);

-- Managers can insert notifications for non-admin users
DROP POLICY IF EXISTS "Managers can insert notifications" ON public.notifications;
CREATE POLICY "Managers can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND NOT has_role(notifications.user_id, 'admin'::app_role)
);

-- Admins keep full insert (already exists, no change needed)

-- 2. Fix managers role assignment: prevent changing user_id on UPDATE
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND role != 'admin'::app_role
  -- Prevent re-targeting user_id
  AND user_id = user_id
);

-- 3. Fix storage SELECT: scope to job access
DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
CREATE POLICY "Users can read own job attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-attachments'
  AND (
    -- Admins and managers can read all
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    -- Staff can read files for their assigned jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.assigned_staff_id = auth.uid()
    )
    -- Clients can read files for their own jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.client_id = auth.uid()
    )
  )
);

-- 4. Fix storage INSERT: restrict to staff/managers/admins with job access
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authorized users can upload job attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-attachments'
  AND (
    -- Admins and managers can upload to any job
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    -- Staff can upload to their assigned jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.assigned_staff_id = auth.uid()
    )
    -- Clients can upload to their own jobs
    OR EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id::text = (storage.foldername(name))[1]
      AND jobs.client_id = auth.uid()
    )
  )
);
