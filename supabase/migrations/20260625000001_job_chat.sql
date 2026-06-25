-- Extend feature_flags to include job_chat
ALTER TABLE public.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_key_check;
ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_key_check
  CHECK (key IN ('appointments', 'client_portal', 'goals', 'reports', 'job_chat'));

INSERT INTO public.feature_flags (key, enabled)
VALUES ('job_chat', true)
ON CONFLICT (key) DO NOTHING;

-- Re-declare both functions with the expanded valid-key set
CREATE OR REPLACE FUNCTION public.is_feature_enabled(feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN feature_key IN ('appointments', 'client_portal', 'goals', 'reports', 'job_chat')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), true)
    ELSE false
  END;
$$;

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

  IF feature_key NOT IN ('appointments', 'client_portal', 'goals', 'reports', 'job_chat') THEN
    RAISE EXCEPTION 'Unknown feature flag: %', feature_key
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.feature_flags (key, enabled, updated_at, updated_by)
  VALUES (feature_key, feature_enabled, now(), auth.uid())
  ON CONFLICT (key) DO UPDATE
    SET enabled    = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
  RETURNING * INTO changed_flag;

  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (
    auth.uid(), 'updated', 'feature_flags', feature_key,
    format('Feature %s was %s', feature_key, CASE WHEN feature_enabled THEN 'enabled' ELSE 'disabled' END),
    jsonb_build_object('key', feature_key, 'enabled', feature_enabled)
  );

  RETURN changed_flag;
END;
$$;

-- job_comments: per-job comment thread visible to all parties with access.
-- is_internal = true rows are hidden from clients.
CREATE TABLE IF NOT EXISTS public.job_comments (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id      UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 2000),
  is_internal BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.job_comments ENABLE ROW LEVEL SECURITY;

-- Clients see only their own job's non-internal comments; staff/admin/manager see all.
CREATE POLICY "select_job_comments" ON public.job_comments
  FOR SELECT TO authenticated
  USING (
    public.is_feature_enabled('job_chat')
    AND (
      NOT is_internal
      OR NOT public.has_role(auth.uid(), 'client'::public.app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_comments.job_id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'manager'::public.app_role)
          OR public.has_role(auth.uid(), 'staff'::public.app_role)
          OR j.client_id = auth.uid()
        )
    )
  );

-- Any party with job access can post; clients cannot mark a comment as internal.
CREATE POLICY "insert_job_comments" ON public.job_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_feature_enabled('job_chat')
    AND (NOT is_internal OR NOT public.has_role(auth.uid(), 'client'::public.app_role))
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'manager'::public.app_role)
          OR public.has_role(auth.uid(), 'staff'::public.app_role)
          OR j.client_id = auth.uid()
        )
    )
  );

-- Comments are immutable once posted.
REVOKE UPDATE, DELETE ON public.job_comments FROM authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'job_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.job_comments;
  END IF;
END $$;
