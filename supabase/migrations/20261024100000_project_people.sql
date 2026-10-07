-- The people named on a project page (client, project lead, who received it), for anyone who
-- can see that project. Staff can't read profiles directly (only admins, managers and the
-- person themselves can), so the page showed "Client: —" and "Project lead: —" to them.
-- This hands back only the people on one project, and only when the caller could see the
-- project under the jobs SELECT policies. Contact details are returned for the client only.

CREATE OR REPLACE FUNCTION public.project_people(_job_id uuid)
RETURNS TABLE (person text, id uuid, full_name text, company_name text, phone text, email text, portal boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_verified_session();

  RETURN QUERY
  WITH visible AS (
    SELECT j.client_id, j.assigned_staff_id, j.received_by FROM public.jobs j
    WHERE j.id = _job_id
      AND auth.uid() IS NOT NULL
      -- Same as the jobs SELECT policies.
      AND (public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'manager'::public.app_role)
        OR j.assigned_staff_id = auth.uid()
        OR j.client_id = auth.uid()
        OR (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_view_job(auth.uid(), j.id)))
  )
  SELECT 'client'::text, p.id, p.full_name, p.company_name, p.phone, u.email::text, p.is_active
  FROM visible v JOIN public.profiles p ON p.id = v.client_id
  LEFT JOIN auth.users u ON u.id = p.id
  UNION ALL
  SELECT 'lead'::text, p.id, p.full_name, NULL::text, NULL::text, NULL::text, NULL::boolean
  FROM visible v JOIN public.profiles p ON p.id = v.assigned_staff_id
  UNION ALL
  SELECT 'received_by'::text, p.id, p.full_name, NULL::text, NULL::text, NULL::text, NULL::boolean
  FROM visible v JOIN public.profiles p ON p.id = v.received_by;
END;
$$;

REVOKE ALL ON FUNCTION public.project_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_people(uuid) TO authenticated;
