
-- Fix: clients should not see internal job comments
DROP POLICY IF EXISTS select_job_comments ON public.job_comments;
CREATE POLICY select_job_comments ON public.job_comments
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR (
    has_role(auth.uid(), 'staff'::app_role)
    AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_comments.job_id AND j.assigned_staff_id = auth.uid())
  )
  OR (
    (NOT job_comments.is_internal)
    AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = job_comments.job_id AND j.client_id = auth.uid())
  )
);

-- Defense-in-depth: prevent managers from escalating an existing user_roles row to admin/manager
CREATE OR REPLACE FUNCTION public.prevent_manager_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    IF NEW.role NOT IN ('staff'::public.app_role, 'client'::public.app_role)
       OR OLD.role NOT IN ('staff'::public.app_role, 'client'::public.app_role) THEN
      RAISE EXCEPTION 'Managers may only manage staff/client roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_manager_role_escalation_trg ON public.user_roles;
CREATE TRIGGER prevent_manager_role_escalation_trg
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_manager_role_escalation();

-- Allow staff/client to read non-sensitive workshop settings via the public view
GRANT SELECT ON public.workshop_settings_public TO authenticated, anon;
