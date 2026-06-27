-- Clear wrong-case logo_url stored from before assets were properly bundled.
-- resolveLogoUrl() falls back to the bundled Vite asset when this is NULL.
UPDATE public.workshop_settings
SET logo_url = NULL
WHERE trim(logo_url) = 'Blumint_Logo.png'
  OR split_part(split_part(replace(trim(logo_url), E'\\', '/'), '?', 1), '#', 1) LIKE '%/Blumint_Logo.png';
