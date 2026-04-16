-- Ensure RLS is explicitly enabled on workshop_settings.
-- This is idempotent — safe to run even if already enabled.
ALTER TABLE public.workshop_settings ENABLE ROW LEVEL SECURITY;
