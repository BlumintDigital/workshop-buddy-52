-- Bug fixes from manual testing (2026-07-02):
--
-- 1. contact_person was never populated at signup — the clients page showed a
--    blank Contact Person column. handle_new_user now copies it from auth
--    metadata (Auth signup sends it for client accounts).
--
-- 2. invite_accepted_at / last_sign_in_at were updated directly from the login
--    flow at aal1, where the restrictive "profiles writes require MFA" policy
--    silently blocks admins and managers — so AdminUsers kept showing
--    "Invite sent" for users who had signed in. touch_profile_login() is a
--    SECURITY DEFINER RPC that records the sign-in for the caller only.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

  INSERT INTO public.profiles (id, full_name, company_name, contact_person)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), ''),
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'contact_person', '')), '')
    )
    ON CONFLICT (id) DO UPDATE
      SET full_name      = EXCLUDED.full_name,
          company_name   = EXCLUDED.company_name,
          contact_person = COALESCE(EXCLUDED.contact_person, profiles.contact_person);

  -- user_roles has UNIQUE (user_id, role), not UNIQUE (user_id).
  -- Replace any existing roles for this user so we end up with exactly one.
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

-- Records a successful sign-in for the calling user, bypassing the aal2
-- restrictive write policy safely (only touches the caller's own row and
-- only these two timestamp columns).
CREATE OR REPLACE FUNCTION public.touch_profile_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
    SET last_sign_in_at    = now(),
        invite_accepted_at = COALESCE(invite_accepted_at, now())
    WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_profile_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_profile_login() TO authenticated;
