DROP FUNCTION IF EXISTS public.set_user_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_caller_user_id uuid, _target_user_id uuid, _role public.app_role)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_role public.app_role;
  _admin_count integer;
  _is_super_admin boolean;
BEGIN
  IF _caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(_caller_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required' USING ERRCODE = '22023';
  END IF;

  IF _target_user_id = _caller_user_id THEN
    RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(is_super_admin, false)
  INTO _is_super_admin
  FROM public.profiles
  WHERE id = _target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(_is_super_admin, false) THEN
    RAISE EXCEPTION 'Super admin accounts cannot be changed here' USING ERRCODE = '42501';
  END IF;

  SELECT role
  INTO _current_role
  FROM public.user_roles
  WHERE user_id = _target_user_id
  LIMIT 1;

  IF _current_role = 'admin'::public.app_role AND _role <> 'admin'::public.app_role THEN
    SELECT count(*)
    INTO _admin_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'::public.app_role
      AND COALESCE(p.is_super_admin, false) = false;

    IF _admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the final admin account' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _role);

  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (
    _caller_user_id,
    'updated',
    'user_roles',
    _target_user_id::text,
    format('Role updated from %s to %s', COALESCE(_current_role::text, 'none'), _role::text),
    jsonb_build_object('target_user_id', _target_user_id, 'old_role', _current_role, 'new_role', _role)
  );

  RETURN _role;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, uuid, public.app_role) TO service_role;