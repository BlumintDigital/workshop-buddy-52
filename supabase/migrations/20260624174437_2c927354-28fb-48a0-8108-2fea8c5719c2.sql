CREATE TABLE public.mfa_rate_limits (
  user_id uuid NOT NULL,
  action text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action)
);

GRANT SELECT ON public.mfa_rate_limits TO authenticated;
GRANT ALL ON public.mfa_rate_limits TO service_role;

ALTER TABLE public.mfa_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rate limits"
ON public.mfa_rate_limits
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);