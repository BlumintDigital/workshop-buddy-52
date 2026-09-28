-- "Trust this browser" that actually works, for every role.
--
-- Admins and managers could never skip the 2FA code: the database rules below
-- demanded a session that had just completed 2FA (aal2), and a trusted browser
-- can't produce one. Now a session vouched for by a trusted browser counts
-- too. The browser must have completed 2FA to be trusted in the first place
-- (mfa-trust-device checks), trust lasts 30 days, and revoking the device in
-- Profile → Security ends it at once.

CREATE TABLE IF NOT EXISTS public.mfa_trusted_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.mfa_trusted_devices(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_trusted_sessions_user ON public.mfa_trusted_sessions(user_id);
-- Only the edge functions (service role) read or write this.
ALTER TABLE public.mfa_trusted_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mfa_trusted_sessions FROM anon, authenticated;

-- 2FA was completed in this session, or the session came from a trusted browser.
CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2'
    OR EXISTS (
      SELECT 1 FROM public.mfa_trusted_sessions s
      WHERE s.session_id = NULLIF(auth.jwt() ->> 'session_id', '')::uuid
        AND s.user_id = auth.uid()
        AND s.expires_at > now()
    )
$$;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated;

-- Swap the aal2 test for mfa_satisfied() in every rule that has it, keeping
-- each rule otherwise exactly as it was.
DO $$
DECLARE
  r record;
  _aal text := '\(auth\.jwt\(\) ->> ''aal''::text\) = ''aal2''::text';
  _using text;
  _check text;
  _changed int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND (qual ~ _aal OR with_check ~ _aal)
  LOOP
    _using := regexp_replace(r.qual, _aal, 'public.mfa_satisfied()', 'g');
    _check := regexp_replace(r.with_check, _aal, 'public.mfa_satisfied()', 'g');
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
      r.policyname, r.tablename, r.permissive, r.cmd,
      array_to_string(ARRAY(SELECT quote_ident(x) FROM unnest(r.roles) x), ', '),
      CASE WHEN _using IS NOT NULL THEN format(' USING (%s)', _using) ELSE '' END,
      CASE WHEN _check IS NOT NULL THEN format(' WITH CHECK (%s)', _check) ELSE '' END
    );
    _changed := _changed + 1;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND (qual ~ 'aal2' OR with_check ~ 'aal2')) THEN
    RAISE EXCEPTION 'Some rules still test aal2 directly';
  END IF;
  RAISE NOTICE 'Rules now using mfa_satisfied(): %', _changed;
END $$;
