-- Add feature_flags JSONB column to workshop_settings.
-- All flags default to true for backward compatibility — existing customers are unaffected.
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{
    "goals": true,
    "client_portal": true,
    "reports": true,
    "appointments": true
  }'::jsonb;
