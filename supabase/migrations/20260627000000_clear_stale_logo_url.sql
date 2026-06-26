-- Clear wrong-case logo_url stored from before assets were properly bundled.
-- resolveLogoUrl() falls back to the bundled Vite asset when this is NULL.
UPDATE public.workshop_settings
SET logo_url = NULL
WHERE logo_url = '/Blumint_Logo.png';
