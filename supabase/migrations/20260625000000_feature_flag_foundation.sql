-- Canonical, workshop-wide feature flags. The legacy JSON column remains in
-- place for rollback compatibility but is no longer the application source.
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY CHECK (key IN ('appointments', 'client_portal', 'goals', 'reports')),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.feature_flags (key, enabled)
SELECT flag.key,
       CASE
         WHEN ws.feature_flags ->> flag.key = 'false' THEN false
         ELSE true
       END
FROM (VALUES
  ('appointments'),
  ('client_portal'),
  ('goals'),
  ('reports')
) AS flag(key)
LEFT JOIN public.workshop_settings ws ON ws.id = 1
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read feature flags" ON public.feature_flags;
CREATE POLICY "Authenticated users read feature flags"
ON public.feature_flags FOR SELECT TO authenticated
USING (true);

-- Mutations go through set_feature_flag so validation and auditing cannot be skipped.
REVOKE INSERT, UPDATE, DELETE ON public.feature_flags FROM anon, authenticated;
GRANT SELECT ON public.feature_flags TO authenticated;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN feature_key IN ('appointments', 'client_portal', 'goals', 'reports')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), true)
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.is_feature_enabled(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_feature_flag(feature_key text, feature_enabled boolean)
RETURNS public.feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_flag public.feature_flags;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can change feature flags'
      USING ERRCODE = '42501';
  END IF;

  IF feature_key NOT IN ('appointments', 'client_portal', 'goals', 'reports') THEN
    RAISE EXCEPTION 'Unknown feature flag: %', feature_key
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feature_flags (key, enabled, updated_at, updated_by)
  VALUES (feature_key, feature_enabled, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
  RETURNING * INTO changed_flag;

  INSERT INTO public.activity_logs (
    user_id, action, table_name, record_id, summary, details
  ) VALUES (
    auth.uid(),
    'updated',
    'feature_flags',
    feature_key,
    format('Feature %s was %s', feature_key, CASE WHEN feature_enabled THEN 'enabled' ELSE 'disabled' END),
    jsonb_build_object('key', feature_key, 'enabled', feature_enabled)
  );

  RETURN changed_flag;
END;
$$;

REVOKE ALL ON FUNCTION public.set_feature_flag(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_feature_flag(text, boolean) TO authenticated;

-- Realtime delivery lets open sessions react immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feature_flags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_flags;
  END IF;
END $$;

-- Feature-specific data gates are restrictive: existing role policies must
-- still grant access, and these policies can only narrow that access.
DROP POLICY IF EXISTS "Feature gate appointments" ON public.appointments;
CREATE POLICY "Feature gate appointments"
ON public.appointments AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_feature_enabled('appointments'))
WITH CHECK (public.is_feature_enabled('appointments'));

DROP POLICY IF EXISTS "Feature gate goals" ON public.monthly_revenue_goals;
CREATE POLICY "Feature gate goals"
ON public.monthly_revenue_goals AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_feature_enabled('goals'))
WITH CHECK (public.is_feature_enabled('goals'));

-- Client portal shutdown affects only client-role access. Staff-facing access
-- to the same business records remains governed by the existing role policies.
DO $$
DECLARE
  gated_table text;
BEGIN
  FOREACH gated_table IN ARRAY ARRAY[
    'jobs', 'job_updates', 'job_tasks', 'job_attachments',
    'job_task_notes', 'job_ratings', 'invoices', 'invoice_items'
  ]
  LOOP
    IF to_regclass('public.' || gated_table) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "Feature gate client portal" ON public.%I', gated_table);
      EXECUTE format(
        'CREATE POLICY "Feature gate client portal" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING (NOT public.has_role(auth.uid(), ''client''::public.app_role) OR public.is_feature_enabled(''client_portal''))
         WITH CHECK (NOT public.has_role(auth.uid(), ''client''::public.app_role) OR public.is_feature_enabled(''client_portal''))',
        gated_table
      );
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Feature gate client portal appointments" ON public.appointments;
CREATE POLICY "Feature gate client portal appointments"
ON public.appointments AS RESTRICTIVE FOR ALL TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'client'::public.app_role)
  OR public.is_feature_enabled('client_portal')
)
WITH CHECK (
  NOT public.has_role(auth.uid(), 'client'::public.app_role)
  OR public.is_feature_enabled('client_portal')
);

DROP POLICY IF EXISTS "Feature gate client portal files" ON storage.objects;
CREATE POLICY "Feature gate client portal files"
ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
USING (
  bucket_id <> 'job-attachments'
  OR NOT public.has_role(auth.uid(), 'client'::public.app_role)
  OR public.is_feature_enabled('client_portal')
)
WITH CHECK (
  bucket_id <> 'job-attachments'
  OR NOT public.has_role(auth.uid(), 'client'::public.app_role)
  OR public.is_feature_enabled('client_portal')
);

-- Report RPCs perform their own admin and flag checks. Bookings return no rows
-- when appointments are disabled so the rest of the reports remain usable.
CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS TABLE(month text, revenue numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_enabled('reports') THEN
    RAISE EXCEPTION 'Reports feature is disabled' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT to_char(i.paid_at, 'YYYY-MM'), sum(i.total)
    FROM public.invoices i
    WHERE i.status = 'paid' AND i.paid_at >= (now() - interval '12 months')
    GROUP BY 1 ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_bookings()
RETURNS TABLE(month text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_enabled('reports') THEN
    RAISE EXCEPTION 'Reports feature is disabled' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_enabled('appointments') THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT to_char(a.appointment_date::timestamp, 'YYYY-MM'), count(*)
    FROM public.appointments a
    WHERE a.appointment_date >= (now() - interval '12 months')::date
    GROUP BY 1 ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_job_completion_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_enabled('reports') THEN
    RAISE EXCEPTION 'Reports feature is disabled' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT j.status, count(*) FROM public.jobs j GROUP BY j.status;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_revenue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_monthly_bookings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_job_completion_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_revenue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_job_completion_stats() TO authenticated;
