-- 1. Fix Security Definer View: recreate with security_invoker=true
DROP VIEW IF EXISTS public.workshop_settings_public;
CREATE VIEW public.workshop_settings_public
  WITH (security_invoker = true)
  AS SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

GRANT SELECT ON public.workshop_settings_public TO anon;
GRANT SELECT ON public.workshop_settings_public TO authenticated;

CREATE POLICY "Anon can read workshop settings via view"
  ON public.workshop_settings FOR SELECT TO anon
  USING (true);

-- 2. Fix Activity Logs: deny direct INSERT/UPDATE/DELETE
CREATE POLICY "Deny direct insert to activity_logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny direct update to activity_logs"
  ON public.activity_logs FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Deny direct delete to activity_logs"
  ON public.activity_logs FOR DELETE TO authenticated
  USING (false);

-- 3. Fix Manager Privilege Escalation: managers can only manage staff/client roles
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
CREATE POLICY "Managers can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  );

DROP POLICY IF EXISTS "Managers can insert roles" ON public.user_roles;
CREATE POLICY "Managers can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  );

DROP POLICY IF EXISTS "Managers can delete roles" ON public.user_roles;
CREATE POLICY "Managers can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND role <> 'admin'::app_role
    AND role <> 'manager'::app_role
  );

-- 4. Fix Workshop Settings Exposure: restrict base table to admin/manager only
DROP POLICY IF EXISTS "Authenticated users can read workshop settings" ON public.workshop_settings;
CREATE POLICY "Admin manager can read workshop settings"
  ON public.workshop_settings FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- 5. Fix Storage Delete Policy: use job-based ownership
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
CREATE POLICY "Users can delete own uploads"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'job-attachments'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::text = (storage.foldername(name))[1]
          AND (jobs.assigned_staff_id = auth.uid() OR jobs.client_id = auth.uid())
      )
    )
  );