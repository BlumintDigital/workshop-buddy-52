-- CSV import (import-data edge function): find a portal client by email to link imported
-- assets to their owner. Server only.
CREATE OR REPLACE FUNCTION public.client_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id FROM auth.users u
  JOIN public.user_roles r ON r.user_id = u.id AND r.role = 'client'
  WHERE lower(u.email) = lower(trim(_email))
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.client_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_id_by_email(text) TO service_role;
