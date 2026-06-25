
-- 1. Move super_admin_email to admin-only contacts table; add VAPID key columns
CREATE TABLE IF NOT EXISTS public.workshop_admin_contacts (
  id integer PRIMARY KEY DEFAULT 1,
  super_admin_email text,
  vapid_public_key text,
  vapid_private_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workshop_admin_contacts_single_row CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.workshop_admin_contacts TO authenticated;
GRANT ALL ON public.workshop_admin_contacts TO service_role;

ALTER TABLE public.workshop_admin_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage admin contacts" ON public.workshop_admin_contacts;
CREATE POLICY "Admins manage admin contacts" ON public.workshop_admin_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.workshop_admin_contacts (id, super_admin_email)
SELECT 1, super_admin_email FROM public.workshop_settings WHERE id = 1
ON CONFLICT (id) DO UPDATE SET super_admin_email = EXCLUDED.super_admin_email;

ALTER TABLE public.workshop_settings DROP COLUMN IF EXISTS super_admin_email;

-- 2. Sanitize get_email_notification_config (no recipient email returned)
DROP FUNCTION IF EXISTS public.get_email_notification_config();
CREATE OR REPLACE FUNCTION public.get_email_notification_config()
RETURNS TABLE(email_notifications_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ws.email_notifications_enabled, false)
  FROM public.workshop_settings ws
  WHERE ws.id = 1;
$$;

-- 3. Convert analytics RPCs to SECURITY INVOKER so RLS is enforced naturally
CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS TABLE(month text, revenue numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT to_char(paid_at, 'YYYY-MM') AS month, sum(total) AS revenue
  FROM public.invoices
  WHERE status = 'paid' AND paid_at >= (now() - interval '12 months')
  GROUP BY month ORDER BY month;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_bookings()
RETURNS TABLE(month text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT to_char(appointment_date::timestamp, 'YYYY-MM') AS month, count(*)
  FROM public.appointments
  WHERE appointment_date >= (now() - interval '12 months')::date
  GROUP BY month ORDER BY month;
$$;

CREATE OR REPLACE FUNCTION public.get_job_completion_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT status, count(*) FROM public.jobs GROUP BY status;
$$;

-- 4. Revoke EXECUTE on all SECURITY DEFINER functions in public from anon/PUBLIC
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.schema, r.name, r.args);
  END LOOP;
END
$do$;

-- Re-grant only functions that legitimately need user execution
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_notification_config() TO authenticated;

-- Analytics: SECURITY INVOKER now, restrict to authenticated only
REVOKE EXECUTE ON FUNCTION public.get_monthly_revenue() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_monthly_bookings() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_job_completion_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_completion_stats() TO authenticated;

-- 5. Explicit allowlist for managers managing roles (no admin/manager assignments)
DROP POLICY IF EXISTS "Managers can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can delete roles" ON public.user_roles;

CREATE POLICY "Managers can insert non-privileged roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND role IN ('staff'::public.app_role, 'client'::public.app_role)
  );

CREATE POLICY "Managers can update non-privileged roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND role IN ('staff'::public.app_role, 'client'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND role IN ('staff'::public.app_role, 'client'::public.app_role)
  );

CREATE POLICY "Managers can delete non-privileged roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND role IN ('staff'::public.app_role, 'client'::public.app_role)
  );

-- 6. Tighten workshop-assets storage SELECT policy to known prefixes
DROP POLICY IF EXISTS "Public read workshop-assets" ON storage.objects;
CREATE POLICY "Public read scoped workshop-assets" ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'workshop-assets'
    AND (name LIKE 'logo-%' OR name LIKE 'login-image-%')
  );
