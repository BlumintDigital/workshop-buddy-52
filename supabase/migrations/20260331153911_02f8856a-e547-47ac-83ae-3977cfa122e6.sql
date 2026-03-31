-- Create a public view with only safe branding columns
CREATE OR REPLACE VIEW public.workshop_settings_public AS
  SELECT id, workshop_name, logo_url, login_image_url, currency
  FROM public.workshop_settings;

-- Grant anon access to the view
GRANT SELECT ON public.workshop_settings_public TO anon;

-- Drop the overly permissive anon policy on the full table
DROP POLICY IF EXISTS "Anon can read workshop settings" ON public.workshop_settings;