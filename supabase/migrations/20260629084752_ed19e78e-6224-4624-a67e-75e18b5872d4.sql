ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS brand_primary_hsl text,
  ADD COLUMN IF NOT EXISTS brand_accent_hsl text;