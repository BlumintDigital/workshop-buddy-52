-- Add backup_restore feature flag (off by default).
-- Gates the Backup & Restore cards in AdminSettings → Data tab.

ALTER TABLE public.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_key_check;
ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_key_check
  CHECK (key IN (
    'appointments','client_portal','goals','reports','job_chat',
    'generate_sample_data','setup_demo_users','backup_restore'
  ));

INSERT INTO public.feature_flags (key, enabled)
VALUES ('backup_restore', false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(feature_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN feature_key IN ('appointments','client_portal','goals','reports','job_chat')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), true)
    WHEN feature_key IN ('generate_sample_data','setup_demo_users','backup_restore')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), false)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_feature_flag(feature_key text, feature_enabled boolean)
RETURNS public.feature_flags
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  changed_flag public.feature_flags;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can change feature flags'
      USING ERRCODE = '42501';
  END IF;

  IF feature_key NOT IN (
    'appointments','client_portal','goals','reports','job_chat',
    'generate_sample_data','setup_demo_users','backup_restore'
  ) THEN
    RAISE EXCEPTION 'Unknown feature flag: %', feature_key
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feature_flags (key, enabled, updated_at, updated_by)
  VALUES (feature_key, feature_enabled, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET enabled     = EXCLUDED.enabled,
        updated_at  = EXCLUDED.updated_at,
        updated_by  = EXCLUDED.updated_by
  RETURNING * INTO changed_flag;

  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (
    auth.uid(), 'updated', 'feature_flags', feature_key,
    format('Feature %s was %s', feature_key,
           CASE WHEN feature_enabled THEN 'enabled' ELSE 'disabled' END),
    jsonb_build_object('key', feature_key, 'enabled', feature_enabled)
  );

  RETURN changed_flag;
END;
$$;
