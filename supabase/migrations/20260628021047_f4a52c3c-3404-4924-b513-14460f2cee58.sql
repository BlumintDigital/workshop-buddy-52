ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_key_check;
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_key_check CHECK (
  key IN ('appointments','client_portal','goals','reports','job_chat','generate_sample_data','setup_demo_users','backup_restore')
);
INSERT INTO public.feature_flags (key, enabled, updated_at)
VALUES ('backup_restore', true, now())
ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now();