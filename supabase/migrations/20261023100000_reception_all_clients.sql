-- Reception picks from every registered client, not only those with their portal switched on.
-- A client who never uses the portal (or whose portal an admin turned off) still walks in and
-- still needs projects logged under their name. `portal` tells the picker which is which.

DROP FUNCTION IF EXISTS public.reception_clients();

CREATE FUNCTION public.reception_clients()
RETURNS TABLE (id uuid, full_name text, company_name text, phone text, email text, portal boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.company_name, p.phone, u.email::text, p.is_active
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'client'
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_permission(auth.uid(), 'reception')
  ORDER BY COALESCE(NULLIF(p.company_name, ''), p.full_name);
$$;

REVOKE ALL ON FUNCTION public.reception_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reception_clients() TO authenticated;
