-- Results from vehicle, VIN and address lookups, kept so the same registration looked up at
-- reception and again on the vehicle's page costs one call to the provider, not two.
-- Only the lookup edge function (service role) reads and writes it.
CREATE TABLE IF NOT EXISTS public.lookup_cache (
  kind text NOT NULL CHECK (kind IN ('vehicle', 'vin', 'address')),
  key text NOT NULL,
  result jsonb,  -- null means the provider had no record
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);

ALTER TABLE public.lookup_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lookup_cache FROM anon, authenticated;
GRANT ALL ON public.lookup_cache TO service_role;

DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.lookup_cache;
CREATE POLICY "Session must have passed 2FA" ON public.lookup_cache AS RESTRICTIVE TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));
