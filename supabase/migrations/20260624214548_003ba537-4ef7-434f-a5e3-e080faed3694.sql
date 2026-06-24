
-- 1. Restrict monthly_revenue_goals SELECT to admin/manager only
DROP POLICY IF EXISTS "select_authenticated" ON public.monthly_revenue_goals;
CREATE POLICY "select_admin_manager" ON public.monthly_revenue_goals
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));

-- 2. Remove broad manager access to client profiles PII
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can update all profiles" ON public.profiles;

-- 3. Restrict workshop_settings SELECT to admins only (managers no longer read email/config)
DROP POLICY IF EXISTS "Admin manager can read workshop settings" ON public.workshop_settings;
CREATE POLICY "Admins can read workshop settings" ON public.workshop_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Remove get_email_notification_config RPC — check is moved into send-email edge function
REVOKE EXECUTE ON FUNCTION public.get_email_notification_config() FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.get_email_notification_config();

-- 5. Revoke EXECUTE on trigger / event-trigger SECURITY DEFINER functions
--    (they only run from the trigger context; no user should call them directly)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_invoice_on_job_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.signup_codes_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
