-- Security hardening from the September 2026 audit.
--
-- 1. Sign-up can no longer choose its own role. The role came straight from the
--    sign-up request, so anyone with the public key could create an admin. Now a
--    self sign-up must carry a valid invite code (redeemed here, in the same
--    transaction) and gets the code's role. Accounts made by trusted server code
--    are announced first with provision_account(email, role), which only the
--    service role can call, and get exactly that role.
-- 2. 2FA is enforced by the database, not just the browser:
--    * admins and managers must have passed 2FA (or be on a trusted browser)
--      for anything, not only the tables that checked before;
--    * anyone who has turned 2FA on must have passed it for this session.
--    Tables get one restrictive rule each; role and permission checks used by
--    functions and storage honour the same test; functions that act for the
--    caller check it first.
-- 3. A backup code now counts as passing 2FA for the session it was used in.
-- 4. Staff can no longer move a project to another client or reassign it.
-- 5. Smaller leaks: get_user_role only answers for yourself (or for admins and
--    managers), task_share_value only for projects you can see, and two job
--    helpers are no longer callable by signed-out visitors.

-- ============================================================ 1. Sign-up
-- Accounts server code is about to create, and the role each should get.
CREATE TABLE IF NOT EXISTS public.account_provisioning (
  email text PRIMARY KEY,
  role app_role NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_provisioning FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.provision_account(_email text, _role app_role)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.account_provisioning (email, role) VALUES (lower(trim(_email)), _role)
  ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, expires_at = now() + interval '1 hour', created_at = now();
$$;
REVOKE ALL ON FUNCTION public.provision_account(text, app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_account(text, app_role) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
  _asked text := NEW.raw_user_meta_data->>'role';
  _code_role app_role;
  _code_id uuid;
BEGIN
  -- Server code announced this account (an admin inviting someone, the
  -- operator's console, test setup): it gets exactly the announced role.
  DELETE FROM public.account_provisioning
  WHERE email = lower(NEW.email) AND expires_at > now()
  RETURNING role INTO _role;

  IF _role IS NULL THEN
    -- A self sign-up: only a valid invite code decides the role.
    SELECT id, role INTO _code_id, _code_role
    FROM public.signup_codes
    WHERE lower(code) = lower(trim(COALESCE(NEW.raw_user_meta_data->>'signup_code', '')))
      AND active
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses_count < max_uses)
    FOR UPDATE;
    IF _code_id IS NULL THEN
      RAISE EXCEPTION 'A valid invite code is required to create an account' USING ERRCODE = '42501';
    END IF;
    UPDATE public.signup_codes SET uses_count = uses_count + 1 WHERE id = _code_id;
    -- A code with no role lets the person pick client or staff, never more.
    _role := COALESCE(_code_role, CASE WHEN _asked = 'staff' THEN 'staff'::app_role ELSE 'client'::app_role END);
  END IF;
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

  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$$;

-- Checks a code without using it up, for the sign-up form's early feedback.
CREATE OR REPLACE FUNCTION public.peek_signup_code(_code text)
RETURNS TABLE(valid boolean, role app_role)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r app_role;
  _found boolean;
BEGIN
  SELECT true, c.role INTO _found, _r
  FROM public.signup_codes c
  WHERE lower(c.code) = lower(trim(COALESCE(_code, '')))
    AND c.active
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND (c.max_uses IS NULL OR c.uses_count < c.max_uses);
  RETURN QUERY SELECT COALESCE(_found, false), _r;
END;
$$;
REVOKE ALL ON FUNCTION public.peek_signup_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peek_signup_code(text) TO service_role;

-- ============================================================ 2. 2FA everywhere
-- This session has passed 2FA as far as this user needs to.
CREATE OR REPLACE FUNCTION public.session_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Not a user session (server code, or signed out): the other rules decide.
    WHEN auth.uid() IS NULL THEN true
    WHEN public.mfa_satisfied() THEN true
    -- Admins and managers always need it.
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'manager')) THEN false
    -- Everyone else needs it once they've turned it on.
    WHEN EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified') THEN false
    ELSE true
  END
$$;
REVOKE ALL ON FUNCTION public.session_verified() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_verified() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_verified_session()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.session_verified() THEN
    RAISE EXCEPTION 'Enter your 2FA code to continue' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_verified_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_verified_session() TO authenticated, service_role;

-- Role and permission checks about the caller only hold once 2FA is satisfied.
-- Checks about someone else, and checks made by server code, are unchanged.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
    AND (_user_id IS DISTINCT FROM auth.uid() OR public.session_verified())
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _user_id = auth.uid() AND NOT public.session_verified() THEN false
    WHEN public.has_role(_user_id, 'admin'::public.app_role) THEN true
    WHEN public.has_role(_user_id, 'client'::public.app_role) THEN false
    WHEN public.has_role(_user_id, 'manager'::public.app_role) THEN true
    ELSE EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = _user_id AND up.permission = _permission)
      OR EXISTS (
        SELECT 1 FROM public.department_members m
        JOIN public.department_permissions dp ON dp.department_id = m.department_id
        WHERE m.user_id = _user_id AND dp.permission = _permission
      )
  END;
$$;

-- One restrictive rule per table: nothing is readable or writable by a signed-in
-- user whose session still owes a 2FA code.
DO $$
DECLARE
  t record;
  _n int := 0;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY "Session must have passed 2FA" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()))',
      t.relname);
    _n := _n + 1;
  END LOOP;
  RAISE NOTICE 'Tables now requiring a verified session: %', _n;
END $$;

DROP POLICY IF EXISTS "Session must have passed 2FA" ON storage.objects;
CREATE POLICY "Session must have passed 2FA" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));

-- The older rules read "not an admin or manager, or passed 2FA". Now that the
-- role check itself needs 2FA, "not an admin" would be true for an admin who
-- hasn't passed it, so those rules test the session directly instead.
DO $$
DECLARE
  r record;
  _n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
      AND (qual LIKE '%mfa_satisfied()%' OR with_check LIKE '%mfa_satisfied()%')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO %s%s%s',
      r.policyname, r.tablename, r.cmd,
      array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) x), ', '),
      CASE WHEN r.qual IS NOT NULL THEN ' USING ((SELECT public.session_verified()))' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK ((SELECT public.session_verified()))' ELSE '' END
    );
    _n := _n + 1;
  END LOOP;
  RAISE NOTICE 'Older 2FA rules now testing the session: %', _n;
END $$;

-- "Users can update own profile" compared against the user's own row with a
-- subquery on profiles, which Postgres treats as recursion once another rule
-- covers every command. A helper reads the row without re-entering the rules.
CREATE OR REPLACE FUNCTION public.profile_flags_unchanged(_id uuid, _super boolean, _active boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _id
      AND p.is_super_admin IS NOT DISTINCT FROM _super
      AND p.is_active IS NOT DISTINCT FROM _active
  )
$$;
REVOKE ALL ON FUNCTION public.profile_flags_unchanged(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_flags_unchanged(uuid, boolean, boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND public.profile_flags_unchanged(id, is_super_admin, is_active));

-- Functions that act for the caller check the session first. (Pure yes/no
-- helpers and the two calls the app makes before the 2FA screen are left out.)
-- New functions that act for a user should start with
--   PERFORM public.assert_verified_session();
DO $$
DECLARE
  f record;
  _def text;
  _new text;
  _n int := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND p.prosecdef AND l.lanname = 'plpgsql'
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('touch_profile_login', 'get_my_basic_profile', 'mfa_satisfied', 'session_verified',
                            'assert_verified_session', 'my_permissions', 'is_feature_enabled')
      AND p.proname !~ '^(has_|can_|is_)'
      AND position('assert_verified_session' in p.prosrc) = 0
  LOOP
    _def := pg_get_functiondef(f.oid);
    -- The first line that is just BEGIN opens the body (some bodies were saved with \r\n).
    _new := regexp_replace(_def, E'\n[ \t]*BEGIN[ \t\r]*\n', E'\nBEGIN\n  PERFORM public.assert_verified_session();\n');
    IF _new = _def THEN
      RAISE EXCEPTION 'Could not add the 2FA check to %', f.proname;
    END IF;
    EXECUTE _new;
    _n := _n + 1;
  END LOOP;
  RAISE NOTICE 'Functions now checking the session: %', _n;
END $$;

-- ============================================================ 3. Backup codes
-- A backup code vouches for the session it was entered in (no device involved).
ALTER TABLE public.mfa_trusted_sessions ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE public.mfa_trusted_sessions ADD COLUMN IF NOT EXISTS via text NOT NULL DEFAULT 'device';
ALTER TABLE public.mfa_trusted_sessions DROP CONSTRAINT IF EXISTS mfa_trusted_sessions_via_check;
ALTER TABLE public.mfa_trusted_sessions ADD CONSTRAINT mfa_trusted_sessions_via_check CHECK (via IN ('device', 'backup_code'));

-- ============================================================ 4. Staff edits
CREATE OR REPLACE FUNCTION public.guard_staff_job_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server code and admins/managers may change anything the other rules allow.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id
     OR NEW.ref IS DISTINCT FROM OLD.ref
     OR NEW.source_request_id IS DISTINCT FROM OLD.source_request_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.received_by IS DISTINCT FROM OLD.received_by THEN
    RAISE EXCEPTION 'Only admins and managers can change who a project belongs to or who leads it' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_staff_job_update ON public.jobs;
CREATE TRIGGER guard_staff_job_update BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_job_update();

-- ============================================================ 5. Small leaks
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
    AND (_user_id = auth.uid() OR auth.uid() IS NULL
         OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.task_share_value(_task_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (
    SELECT * FROM public.job_tasks
    WHERE id = _task_id AND (auth.uid() IS NULL OR public.can_view_job(auth.uid(), job_id))
  ),
  agreed AS (
    SELECT COALESCE(sum(q.subtotal), 0) AS total
    FROM public.project_quotes q, t WHERE q.job_id = t.job_id AND q.status = 'accepted'
  ),
  siblings AS (
    SELECT count(*) AS n, sum(COALESCE(s.estimated_hours, 0)) AS hours, bool_and(COALESCE(s.estimated_hours, 0) > 0) AS all_estimated
    FROM public.job_tasks s, t WHERE s.job_id = t.job_id AND s.rework_of IS NULL
  )
  SELECT CASE
    WHEN t.rework_of IS NOT NULL THEN 0
    WHEN agreed.total <= 0 THEN COALESCE(t.value, 0)
    WHEN siblings.all_estimated AND siblings.hours > 0 THEN round(agreed.total * t.estimated_hours / siblings.hours, 2)
    ELSE round(agreed.total / GREATEST(siblings.n, 1), 2)
  END
  FROM t, agreed, siblings
$$;

REVOKE EXECUTE ON FUNCTION public.can_run_job(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_job_path(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_run_job(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_job_path(uuid, text) TO authenticated, service_role;
-- Storage rules that call them apply to signed-in users only.
ALTER POLICY "Users can read own job attachments" ON storage.objects TO authenticated;
ALTER POLICY "Users can delete own uploads" ON storage.objects TO authenticated;
