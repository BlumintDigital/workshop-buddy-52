-- 1. Fix anon access to workshop_settings: use a security definer function instead of direct anon SELECT
-- The view with security_invoker=true needs the caller to have SELECT on the base table.
-- Since we can't restrict columns via RLS, we'll switch back to security_definer view
-- but that's what triggered the original lint warning. Instead, let's keep security_invoker
-- and accept the anon policy on the base table is needed, but mark it clearly.
-- Actually the correct approach: drop the anon policy, recreate view as SECURITY DEFINER
-- (which is appropriate here since we intentionally restrict columns), and silence the lint.

-- Drop the anon policy that exposes the full base table
DROP POLICY IF EXISTS "Anon can read workshop settings via view" ON public.workshop_settings;
DROP POLICY IF EXISTS "Anon can read workshop settings for view" ON public.workshop_settings;

-- Recreate view as security definer (intentional: it only exposes safe columns)
DROP VIEW IF EXISTS public.workshop_settings_public;
CREATE VIEW public.workshop_settings_public
  AS SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

GRANT SELECT ON public.workshop_settings_public TO anon;
GRANT SELECT ON public.workshop_settings_public TO authenticated;

-- 2. Add anon deny policies on activity_logs
CREATE POLICY "Deny anon insert to activity_logs"
  ON public.activity_logs FOR INSERT TO anon
  WITH CHECK (false);

CREATE POLICY "Deny anon select activity_logs"
  ON public.activity_logs FOR SELECT TO anon
  USING (false);

-- 3. Tighten manager notification policy
DROP POLICY IF EXISTS "Managers can insert notifications" ON public.notifications;
CREATE POLICY "Managers can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role)
    AND (
      has_role(user_id, 'staff'::app_role)
      OR has_role(user_id, 'client'::app_role)
      OR user_id = auth.uid()
    )
  );