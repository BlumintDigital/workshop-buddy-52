-- 1. Replace permissive deny policies with restrictive ones on activity_logs
DROP POLICY IF EXISTS "Deny direct insert to activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Deny direct update to activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Deny direct delete to activity_logs" ON public.activity_logs;

CREATE POLICY "Block direct insert to activity_logs"
  ON public.activity_logs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct update to activity_logs"
  ON public.activity_logs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Block direct delete to activity_logs"
  ON public.activity_logs AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- 2. Fix admins only policy: change from public to authenticated
DROP POLICY IF EXISTS "admins only" ON public.workshop_settings;
CREATE POLICY "admins only"
  ON public.workshop_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));