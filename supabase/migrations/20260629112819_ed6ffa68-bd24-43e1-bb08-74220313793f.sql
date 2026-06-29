
CREATE OR REPLACE FUNCTION public.prevent_user_roles_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id on user_roles cannot be changed via UPDATE'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_roles_user_id_change ON public.user_roles;
CREATE TRIGGER trg_prevent_user_roles_user_id_change
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_user_roles_user_id_change();

REVOKE EXECUTE ON FUNCTION public.prevent_user_roles_user_id_change() FROM PUBLIC, anon, authenticated;
