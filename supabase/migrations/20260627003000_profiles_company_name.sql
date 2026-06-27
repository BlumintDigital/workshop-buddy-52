ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name text;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  BEGIN
    _role := (NEW.raw_user_meta_data->>'role')::app_role;
  EXCEPTION WHEN others THEN
    _role := 'client';
  END;
  IF _role IS NULL THEN _role := 'client'; END IF;

  INSERT INTO public.profiles (id, full_name, company_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), '')
    )
    ON CONFLICT (id) DO UPDATE
      SET full_name    = EXCLUDED.full_name,
          company_name = EXCLUDED.company_name;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
