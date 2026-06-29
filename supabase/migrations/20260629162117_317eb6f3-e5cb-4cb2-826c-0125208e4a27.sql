DROP FUNCTION IF EXISTS public.get_my_basic_profile();

CREATE OR REPLACE FUNCTION public.get_my_basic_profile()
 RETURNS TABLE(full_name text, avatar_url text, invite_accepted_at timestamp with time zone, company_name text, phone text, address text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.full_name, p.avatar_url, p.invite_accepted_at, p.company_name, p.phone, p.address
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_basic_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_basic_profile() TO authenticated;