-- Settings are saved with an upsert (INSERT ... ON CONFLICT DO UPDATE). The BEFORE INSERT trigger
-- sees the column default for enabled_industries, which the guard mistook for an attempt to change
-- the allowed types, so admins couldn't save Settings. On insert, keep the existing row's list.
CREATE OR REPLACE FUNCTION public.guard_workshop_industries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _existing text[];
  _privileged boolean := COALESCE(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin', 'service_role');
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT enabled_industries INTO _existing FROM public.workshop_settings WHERE id = NEW.id;
    IF _existing IS NOT NULL AND NOT _privileged THEN
      -- An upsert of an existing row: whatever it sends, the allowed list stays as it is.
      NEW.enabled_industries := _existing;
    ELSIF _existing IS NULL AND NOT _privileged THEN
      RAISE EXCEPTION 'Only Shoplane can set up a workshop' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.enabled_industries IS DISTINCT FROM OLD.enabled_industries AND NOT _privileged THEN
    RAISE EXCEPTION 'Only Shoplane can change which workshop types you have' USING ERRCODE = '42501';
  END IF;
  IF NOT (NEW.industry = ANY (NEW.enabled_industries)) THEN
    RAISE EXCEPTION 'That workshop type isn''t switched on for this workshop' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_workshop_industries() FROM PUBLIC, anon, authenticated;
