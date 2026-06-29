
CREATE OR REPLACE VIEW public.workshop_settings_public
WITH (security_invoker = true) AS
SELECT
  ws.id,
  ws.workshop_name,
  ws.logo_url,
  ws.login_image_url,
  ws.currency,
  (SELECT wac.vapid_public_key FROM public.workshop_admin_contacts wac WHERE wac.id = 1) AS vapid_public_key
FROM public.workshop_settings ws;

GRANT SELECT ON public.workshop_settings_public TO anon;
GRANT SELECT ON public.workshop_settings_public TO authenticated;
