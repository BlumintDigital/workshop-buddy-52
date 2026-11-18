-- Automatic reminders: polite emails for quotes nobody has decided, overdue invoices, and items
-- waiting to be collected. Each recipe is an on/off switch with one option. Switching one on
-- never reaches back: only events after enabled_at count.
--
-- Every 15 minutes pg_cron calls run_automatic_reminders(), which asks the
-- automatic-reminders edge function to do the work. That function claims a row in
-- automation_runs before each send (unique per recipe, subject and step), so nobody gets the
-- same reminder twice even if the job runs twice. A failed send stays recorded as failed and
-- is never retried. Nothing goes out between 21:00 and 08:00 (Europe/London).
--
-- Config the cron needs (both in Vault; if either is missing the job does nothing):
--   shoplane_project_url        e.g. https://<ref>.supabase.co
--   shoplane_automation_secret  the same value as the edge function secret AUTOMATION_SECRET

CREATE TABLE IF NOT EXISTS public.automation_recipes (
  recipe text PRIMARY KEY CHECK (recipe IN ('quote_reminder', 'invoice_overdue', 'collection_reminder')),
  enabled boolean NOT NULL DEFAULT false,
  days integer[] NOT NULL,
  enabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
INSERT INTO public.automation_recipes (recipe, days) VALUES
  ('quote_reminder', ARRAY[3]),
  ('invoice_overdue', ARRAY[7, 21]),
  ('collection_reminder', ARRAY[3])
ON CONFLICT (recipe) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe text NOT NULL REFERENCES public.automation_recipes (recipe) ON DELETE CASCADE,
  subject_id uuid NOT NULL,
  step integer NOT NULL CHECK (step >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  label text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (recipe, subject_id, step)
);
CREATE INDEX IF NOT EXISTS automation_runs_created_idx ON public.automation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_failed_idx ON public.automation_runs (status) WHERE status = 'failed';

-- Admins read; only the server writes (the edge function with the service role, and the
-- set_automation_recipe function below).
ALTER TABLE public.automation_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_recipes, public.automation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.automation_recipes, public.automation_runs TO authenticated;
GRANT ALL ON public.automation_recipes, public.automation_runs TO service_role;

DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.automation_recipes;
CREATE POLICY "Session must have passed 2FA" ON public.automation_recipes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));
DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.automation_runs;
CREATE POLICY "Session must have passed 2FA" ON public.automation_runs AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));
DROP POLICY IF EXISTS "Admins read recipes" ON public.automation_recipes;
CREATE POLICY "Admins read recipes" ON public.automation_recipes FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Admins read runs" ON public.automation_runs;
CREATE POLICY "Admins read runs" ON public.automation_runs FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- ---------------------------------------------------------------- Switch a recipe on or off (admins)
-- Switching on stamps enabled_at, so only later events count. Changing the option keeps it.
CREATE OR REPLACE FUNCTION public.set_automation_recipe(_recipe text, _enabled boolean, _days integer[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _clean integer[];
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.has_role(_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can change automatic reminders' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT d ORDER BY d) INTO _clean FROM unnest(_days) AS d WHERE d IS NOT NULL;
  IF _clean IS NULL OR EXISTS (SELECT 1 FROM unnest(_clean) AS d WHERE d < 1 OR d > 365) THEN
    RAISE EXCEPTION 'Choose days between 1 and 365' USING ERRCODE = '22023';
  END IF;
  IF _recipe = 'invoice_overdue' THEN
    IF cardinality(_clean) > 4 THEN RAISE EXCEPTION 'Choose up to 4 days' USING ERRCODE = '22023'; END IF;
  ELSIF cardinality(_clean) <> 1 OR _clean[1] > 60 THEN
    RAISE EXCEPTION 'Choose a number of days between 1 and 60' USING ERRCODE = '22023';
  END IF;

  UPDATE public.automation_recipes
    SET days = _clean,
        enabled_at = CASE WHEN NOT _enabled THEN NULL WHEN enabled THEN enabled_at ELSE now() END,
        enabled = _enabled,
        updated_at = now(),
        updated_by = _uid
    WHERE recipe = _recipe;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reminder' USING ERRCODE = 'P0002'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_automation_recipe(text, boolean, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_automation_recipe(text, boolean, integer[]) TO authenticated;

-- ---------------------------------------------------------------- The 15-minute tick (server only)
-- Wakes the edge function when a recipe is on. Missing config (pg_net, Vault or the two
-- secrets) means do nothing, quietly, like send_asset_reminders does when its feature is off.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.run_automatic_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.automation_recipes WHERE enabled) THEN RETURN; END IF;
  IF to_regclass('vault.decrypted_secrets') IS NULL OR to_regnamespace('net') IS NULL THEN RETURN; END IF;
  -- Dynamic SQL so the function still compiles and runs where Vault or pg_net are absent.
  EXECUTE $q$SELECT max(decrypted_secret) FILTER (WHERE name = 'shoplane_project_url'),
                    max(decrypted_secret) FILTER (WHERE name = 'shoplane_automation_secret')
             FROM vault.decrypted_secrets
             WHERE name IN ('shoplane_project_url', 'shoplane_automation_secret')$q$
    INTO _url, _secret;
  IF COALESCE(_url, '') = '' OR COALESCE(_secret, '') = '' THEN RETURN; END IF;
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := ''{}''::jsonb, timeout_milliseconds := 60000)'
    USING rtrim(_url, '/') || '/functions/v1/automatic-reminders',
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _secret);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_automatic_reminders skipped: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.run_automatic_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_automatic_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shoplane-automatic-reminders') THEN
    PERFORM cron.unschedule('shoplane-automatic-reminders');
  END IF;
  PERFORM cron.schedule('shoplane-automatic-reminders', '*/15 * * * *', 'SELECT public.run_automatic_reminders()');
END $$;
