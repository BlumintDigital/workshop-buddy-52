ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS super_admin_email text DEFAULT NULL;

-- Recreate the public view WITHOUT super_admin_email
CREATE OR REPLACE VIEW public.workshop_settings_public AS
SELECT id, workshop_name, logo_url, login_image_url, currency
FROM public.workshop_settings;