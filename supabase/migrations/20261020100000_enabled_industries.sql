-- Workshop types a customer has. Shoplane Control decides which types a workshop may use
-- (enabled_industries, changed only through admin-api with the service role); the workshop's
-- admins switch between those (industry), which sets the wording and reception form for everyone.

ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS enabled_industries text[] NOT NULL DEFAULT ARRAY['industrial'];

-- Existing workshops keep exactly the type they have.
UPDATE public.workshop_settings SET enabled_industries = ARRAY[industry]
WHERE NOT (industry = ANY (enabled_industries));

ALTER TABLE public.workshop_settings DROP CONSTRAINT IF EXISTS workshop_settings_enabled_industries_check;
ALTER TABLE public.workshop_settings ADD CONSTRAINT workshop_settings_enabled_industries_check
  CHECK (cardinality(enabled_industries) >= 1
         AND enabled_industries <@ ARRAY['industrial', 'garage', 'fleet', 'marine_plant']::text[]);

CREATE OR REPLACE FUNCTION public.guard_workshop_industries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.enabled_industries IS DISTINCT FROM OLD.enabled_industries
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'Only Shoplane can change which workshop types you have' USING ERRCODE = '42501';
  END IF;
  IF NOT (NEW.industry = ANY (NEW.enabled_industries)) THEN
    RAISE EXCEPTION 'That workshop type isn''t switched on for this workshop' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_workshop_industries() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_workshop_industries ON public.workshop_settings;
CREATE TRIGGER guard_workshop_industries
  BEFORE INSERT OR UPDATE OF industry, enabled_industries ON public.workshop_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_workshop_industries();
