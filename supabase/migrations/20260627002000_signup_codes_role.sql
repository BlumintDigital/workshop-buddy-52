
-- Add role column to signup_codes
ALTER TABLE public.signup_codes
  ADD COLUMN IF NOT EXISTS role app_role NOT NULL DEFAULT 'client';

-- Update redeem_signup_code to return role.
-- Drop the existing boolean-returning version first.
DROP FUNCTION IF EXISTS public.redeem_signup_code(text);

CREATE OR REPLACE FUNCTION public.redeem_signup_code(_code text)
RETURNS TABLE(valid boolean, role app_role)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.signup_codes%ROWTYPE;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN QUERY SELECT false, 'client'::app_role;
    RETURN;
  END IF;

  SELECT * INTO _row FROM public.signup_codes
    WHERE lower(code) = lower(trim(_code))
      AND active = TRUE
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses_count < max_uses)
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'client'::app_role;
    RETURN;
  END IF;

  UPDATE public.signup_codes SET uses_count = uses_count + 1 WHERE id = _row.id;
  RETURN QUERY SELECT true, _row.role;
END;
$$;

-- Only the service role (edge function) should call this; anon/authenticated must not.
REVOKE EXECUTE ON FUNCTION public.redeem_signup_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_signup_code(text) TO service_role;

-- Update handle_new_user trigger to read role from user metadata.
-- Preserves existing profile + user_roles insert logic from the original migration.
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
  IF _role IS NULL THEN
    _role := 'client';
  END IF;

  INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, _role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

-- Re-apply the execute restriction set in a prior security migration
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
