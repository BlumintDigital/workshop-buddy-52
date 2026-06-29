
CREATE OR REPLACE FUNCTION public.get_my_basic_profile()
RETURNS TABLE(full_name text, avatar_url text, invite_accepted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name, p.avatar_url, p.invite_accepted_at
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_basic_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_basic_profile() TO authenticated;
