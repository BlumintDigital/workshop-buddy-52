-- Recreate view with SECURITY INVOKER to fix the security definer linter warning
DROP VIEW IF EXISTS public.workshop_settings_public;
CREATE VIEW public.workshop_settings_public
  WITH (security_invoker = true)
  AS SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

-- Grant anon access to the view
GRANT SELECT ON public.workshop_settings_public TO anon;

-- We need a policy allowing anon to read workshop_settings through the view
-- since SECURITY INVOKER means RLS is checked as the calling user (anon)
CREATE POLICY "Anon can read workshop settings for view"
  ON public.workshop_settings
  FOR SELECT TO anon
  USING (true);