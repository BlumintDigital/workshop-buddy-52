-- Industry profiles, the asset register, service reminders.
--
-- * workshop_settings.industry: what kind of workshop this is (set by Shoplane Control at setup,
--   changeable in Settings). The app uses it for wording, the reception form and defaults; the
--   data model is the same for every industry.
-- * assets: the customers' machines, vehicles, engines and plant, each with its own service
--   history (the projects linked to it) and an hours or mileage reading.
-- * asset_reminders: services and inspections that come round again, by date and/or meter.
--   A daily job tells the customer and the workshop when one is coming due.
-- * Feature flag "assets" switches the module on (on by default).

-- ---------------------------------------------------------------- 1. Industry profile
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT 'industrial';
ALTER TABLE public.workshop_settings DROP CONSTRAINT IF EXISTS workshop_settings_industry_check;
ALTER TABLE public.workshop_settings ADD CONSTRAINT workshop_settings_industry_check
  CHECK (industry IN ('industrial', 'garage', 'fleet', 'marine_plant'));

-- The industry decides wording everyone sees, so the public settings carry it too. Same columns
-- as before with industry appended; the return type changes, so the view and function are rebuilt.
DROP VIEW IF EXISTS public.workshop_settings_public;
DROP FUNCTION IF EXISTS public.get_public_workshop_settings();
CREATE FUNCTION public.get_public_workshop_settings()
RETURNS TABLE (
  id integer, workshop_name text, logo_url text, login_image_url text, currency text, vapid_public_key text,
  brand_primary_hsl text, brand_accent_hsl text, enabled_currencies text[], address text, phone text,
  contact_email text, industry text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ws.id, ws.workshop_name, ws.logo_url, ws.login_image_url, ws.currency,
    (SELECT wac.vapid_public_key FROM public.workshop_admin_contacts wac WHERE wac.id = 1),
    ws.brand_primary_hsl, ws.brand_accent_hsl, ws.enabled_currencies,
    CASE WHEN auth.uid() IS NOT NULL THEN ws.address END,
    CASE WHEN auth.uid() IS NOT NULL THEN ws.phone END,
    CASE WHEN auth.uid() IS NOT NULL THEN ws.contact_email END,
    ws.industry
  FROM public.workshop_settings ws
  WHERE ws.id = 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_workshop_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_workshop_settings() TO anon, authenticated;
CREATE VIEW public.workshop_settings_public WITH (security_invoker = true) AS
  SELECT * FROM public.get_public_workshop_settings();
GRANT SELECT ON public.workshop_settings_public TO anon, authenticated;

-- ---------------------------------------------------------------- 2. Feature switch
ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_key_check;
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_key_check CHECK (key = ANY (ARRAY[
  'appointments', 'client_portal', 'goals', 'reports', 'job_chat', 'inventory', 'shipping',
  'accounting_sync', 'generate_sample_data', 'setup_demo_users', 'backup_restore', 'assistant', 'assets'
]));
INSERT INTO public.feature_flags (key, enabled) VALUES ('assets', true) ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN feature_key IN ('appointments','client_portal','goals','reports','job_chat','inventory','shipping','accounting_sync','assets')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), true)
    WHEN feature_key IN ('generate_sample_data','setup_demo_users','backup_restore','assistant')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), false)
    ELSE false
  END;
$$;

-- ---------------------------------------------------------------- 3. Assets
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A portal client, or a walk-in owner recorded by name and phone.
  client_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  owner_name text,
  owner_phone text,
  owner_email text,
  kind text NOT NULL DEFAULT 'machine' CHECK (kind IN ('machine', 'vehicle', 'engine', 'plant', 'vessel', 'other')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  make_model text,
  serial_number text,
  registration text,
  vin text,
  fleet_number text,
  meter_unit text CHECK (meter_unit IS NULL OR meter_unit IN ('hours', 'miles', 'km')),
  meter_reading numeric CHECK (meter_reading IS NULL OR meter_reading >= 0),
  meter_read_at timestamptz,
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_client_idx ON public.assets (client_id) WHERE archived_at IS NULL;
-- Reception finds a vehicle by registration or a machine by serial number in one box.
CREATE INDEX IF NOT EXISTS assets_registration_idx ON public.assets (upper(replace(registration, ' ', ''))) WHERE registration IS NOT NULL;
CREATE INDEX IF NOT EXISTS assets_serial_idx ON public.assets (upper(serial_number)) WHERE serial_number IS NOT NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS meter_reading numeric CHECK (meter_reading IS NULL OR meter_reading >= 0);
CREATE INDEX IF NOT EXISTS jobs_asset_idx ON public.jobs (asset_id) WHERE asset_id IS NOT NULL;

ALTER TABLE public.client_requests
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.assets (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- 4. Reminders
CREATE TABLE IF NOT EXISTS public.asset_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  interval_months int CHECK (interval_months IS NULL OR interval_months BETWEEN 1 AND 120),
  interval_meter numeric CHECK (interval_meter IS NULL OR interval_meter > 0),
  due_date date,
  due_meter numeric CHECK (due_meter IS NULL OR due_meter >= 0),
  last_done_on date,
  last_done_meter numeric,
  last_done_job_id uuid REFERENCES public.jobs (id) ON DELETE SET NULL,
  notified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT active OR due_date IS NOT NULL OR due_meter IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS asset_reminders_asset_idx ON public.asset_reminders (asset_id);
CREATE INDEX IF NOT EXISTS asset_reminders_due_idx ON public.asset_reminders (due_date) WHERE active;

-- ---------------------------------------------------------------- 5. Who can see and change them
-- Admins, managers and anyone with Reception or Project planning manage assets.
CREATE OR REPLACE FUNCTION public.can_manage_assets(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'manager'::public.app_role)
    OR public.has_permission(_uid, 'reception') OR public.has_permission(_uid, 'planning')
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_assets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_assets(uuid) TO authenticated, service_role;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assets, public.asset_reminders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets, public.asset_reminders TO authenticated;

DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.assets;
CREATE POLICY "Session must have passed 2FA" ON public.assets AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));
DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.asset_reminders;
CREATE POLICY "Session must have passed 2FA" ON public.asset_reminders AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));
DROP POLICY IF EXISTS "Feature gate assets" ON public.assets;
CREATE POLICY "Feature gate assets" ON public.assets AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_feature_enabled('assets')) WITH CHECK (public.is_feature_enabled('assets'));
DROP POLICY IF EXISTS "Feature gate assets" ON public.asset_reminders;
CREATE POLICY "Feature gate assets" ON public.asset_reminders AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_feature_enabled('assets')) WITH CHECK (public.is_feature_enabled('assets'));

-- Everyone on the workshop team can look an asset up; clients see only their own.
CREATE POLICY "Workshop reads assets" ON public.assets FOR SELECT TO authenticated
  USING (NOT public.has_role((SELECT auth.uid()), 'client'::public.app_role));
CREATE POLICY "Clients read own assets" ON public.assets FOR SELECT TO authenticated
  USING (client_id = (SELECT auth.uid()) AND public.is_feature_enabled('client_portal'));
CREATE POLICY "Workshop manages assets" ON public.assets FOR ALL TO authenticated
  USING (public.can_manage_assets((SELECT auth.uid()))) WITH CHECK (public.can_manage_assets((SELECT auth.uid())));

CREATE POLICY "Workshop reads reminders" ON public.asset_reminders FOR SELECT TO authenticated
  USING (NOT public.has_role((SELECT auth.uid()), 'client'::public.app_role));
CREATE POLICY "Clients read own reminders" ON public.asset_reminders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND a.client_id = (SELECT auth.uid()))
         AND public.is_feature_enabled('client_portal'));
CREATE POLICY "Workshop manages reminders" ON public.asset_reminders FOR ALL TO authenticated
  USING (public.can_manage_assets((SELECT auth.uid()))) WITH CHECK (public.can_manage_assets((SELECT auth.uid())));

-- Keep updated_at honest.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS assets_touch ON public.assets;
CREATE TRIGGER assets_touch BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS asset_reminders_touch ON public.asset_reminders;
CREATE TRIGGER asset_reminders_touch BEFORE UPDATE ON public.asset_reminders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- A client can only attach their own asset to a request.
CREATE OR REPLACE FUNCTION public.check_request_asset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.assets a WHERE a.id = NEW.asset_id AND a.client_id IS NOT DISTINCT FROM NEW.client_id
  ) THEN
    RAISE EXCEPTION 'That asset isn''t yours' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_request_asset() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS client_requests_asset_check ON public.client_requests;
CREATE TRIGGER client_requests_asset_check BEFORE INSERT OR UPDATE OF asset_id ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_request_asset();

-- ---------------------------------------------------------------- 6. Marking a service done
-- Records the service and rolls the reminder forward by its interval.
CREATE OR REPLACE FUNCTION public.complete_asset_reminder(_reminder uuid, _done_on date DEFAULT current_date,
                                                          _meter numeric DEFAULT NULL, _job uuid DEFAULT NULL)
RETURNS public.asset_reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.asset_reminders;
  _on date := COALESCE(_done_on, current_date);
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.can_manage_assets(auth.uid()) THEN
    RAISE EXCEPTION 'You can''t update service reminders' USING ERRCODE = '42501';
  END IF;
  IF _meter IS NOT NULL AND _meter < 0 THEN RAISE EXCEPTION 'The reading can''t be negative' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _r FROM public.asset_reminders WHERE id = _reminder FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reminder not found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.asset_reminders SET
    last_done_on = _on,
    last_done_meter = _meter,
    last_done_job_id = _job,
    due_date = CASE WHEN interval_months IS NOT NULL THEN (_on + make_interval(months => interval_months))::date END,
    due_meter = CASE WHEN interval_meter IS NULL THEN NULL
                     WHEN _meter IS NOT NULL THEN _meter + interval_meter
                     ELSE COALESCE(due_meter, 0) + interval_meter END,
    -- A reminder with neither interval was a one-off: doing it finishes it.
    active = (interval_months IS NOT NULL OR interval_meter IS NOT NULL),
    notified_at = NULL
  WHERE id = _reminder
  RETURNING * INTO _r;

  -- A reading taken at the service is the asset's newest reading.
  IF _meter IS NOT NULL THEN
    UPDATE public.assets SET meter_reading = _meter, meter_read_at = now()
    WHERE id = _r.asset_id AND (meter_reading IS NULL OR meter_reading <= _meter);
  END IF;
  RETURN _r;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_asset_reminder(uuid, date, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_asset_reminder(uuid, date, numeric, uuid) TO authenticated;

-- ---------------------------------------------------------------- 7. Reception creates and links assets
CREATE OR REPLACE FUNCTION public.create_project(_p jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _intake text := COALESCE(_p->>'intake_type', 'approved');
  _client uuid := NULLIF(_p->>'client_id', '')::uuid;
  _request uuid := NULLIF(_p->>'source_request_id', '')::uuid;
  _asset uuid := NULLIF(_p->>'asset_id', '')::uuid;
  _meter numeric := NULLIF(_p->>'meter_reading', '')::numeric;
  _reg text := NULLIF(upper(trim(COALESCE(_p->>'registration', ''))), '');
  _ref text;
  _title text := trim(COALESCE(_p->>'title', ''));
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.has_permission(_uid, 'reception') THEN RAISE EXCEPTION 'You can''t log new projects' USING ERRCODE = '42501'; END IF;
  IF length(_title) = 0 THEN RAISE EXCEPTION 'Describe the machine or the work' USING ERRCODE = '22023'; END IF;
  IF _intake NOT IN ('evaluation', 'quote', 'approved') THEN RAISE EXCEPTION 'Unknown intake type' USING ERRCODE = '22023'; END IF;
  IF _client IS NOT NULL AND NOT public.has_role(_client, 'client'::public.app_role) THEN
    RAISE EXCEPTION 'That person isn''t a client' USING ERRCODE = '22023';
  END IF;
  IF _meter IS NOT NULL AND _meter < 0 THEN RAISE EXCEPTION 'The reading can''t be negative' USING ERRCODE = '22023'; END IF;

  -- Save the item to the owner's assets when reception asks, so its history builds up.
  IF _asset IS NULL AND COALESCE((_p->>'save_asset')::boolean, false) AND public.is_feature_enabled('assets') THEN
    INSERT INTO public.assets (client_id, owner_name, owner_phone, owner_email, kind, name, make_model, serial_number,
                               registration, vin, fleet_number, meter_unit, meter_reading, meter_read_at, created_by)
    VALUES (
      _client,
      CASE WHEN _client IS NULL THEN NULLIF(trim(COALESCE(_p->>'contact_name', '')), '') END,
      CASE WHEN _client IS NULL THEN NULLIF(trim(COALESCE(_p->>'contact_phone', '')), '') END,
      CASE WHEN _client IS NULL THEN NULLIF(trim(COALESCE(_p->>'contact_email', '')), '') END,
      COALESCE(NULLIF(_p->>'asset_kind', ''), 'machine'),
      left(COALESCE(NULLIF(trim(COALESCE(_p->>'asset_name', '')), ''), NULLIF(trim(COALESCE(_p->>'make_model', '')), ''), _reg, _title), 200),
      NULLIF(trim(COALESCE(_p->>'make_model', '')), ''),
      NULLIF(trim(COALESCE(_p->>'serial_number', '')), ''),
      _reg,
      NULLIF(upper(trim(COALESCE(_p->>'vin', ''))), ''),
      NULLIF(trim(COALESCE(_p->>'fleet_number', '')), ''),
      NULLIF(_p->>'meter_unit', ''),
      _meter,
      CASE WHEN _meter IS NOT NULL THEN now() END,
      _uid
    ) RETURNING id INTO _asset;
  ELSIF _asset IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.assets WHERE id = _asset) THEN
      RAISE EXCEPTION 'That asset no longer exists' USING ERRCODE = '22023';
    END IF;
    IF _meter IS NOT NULL THEN
      UPDATE public.assets SET meter_reading = _meter, meter_read_at = now()
      WHERE id = _asset AND (meter_reading IS NULL OR meter_reading <= _meter);
    END IF;
  END IF;

  INSERT INTO public.jobs (
    title, description, priority, status, intake_type, client_id, assigned_staff_id, due_date, estimated_hours,
    make_model, serial_number, accessories, condition_notes, contact_name, contact_phone, contact_email,
    received_by, received_at, source_request_id, asset_id, registration, meter_reading
  ) VALUES (
    _title,
    NULLIF(trim(COALESCE(_p->>'description', '')), ''),
    COALESCE(NULLIF(_p->>'priority', ''), 'medium'),
    CASE WHEN _intake = 'approved' THEN 'pending' ELSE 'evaluation' END,
    _intake,
    _client,
    NULLIF(_p->>'assigned_staff_id', '')::uuid,
    NULLIF(_p->>'due_date', '')::date,
    NULLIF(_p->>'estimated_hours', '')::numeric,
    NULLIF(trim(COALESCE(_p->>'make_model', '')), ''),
    NULLIF(trim(COALESCE(_p->>'serial_number', '')), ''),
    NULLIF(trim(COALESCE(_p->>'accessories', '')), ''),
    NULLIF(trim(COALESCE(_p->>'condition_notes', '')), ''),
    NULLIF(trim(COALESCE(_p->>'contact_name', '')), ''),
    NULLIF(trim(COALESCE(_p->>'contact_phone', '')), ''),
    NULLIF(trim(COALESCE(_p->>'contact_email', '')), ''),
    _uid, now(), _request, _asset, _reg, _meter
  ) RETURNING id, ref INTO _id, _ref;

  IF _request IS NOT NULL THEN
    UPDATE public.client_requests
      SET status = 'converted', converted_job_id = _id, reviewed_by = _uid, reviewed_at = now()
      WHERE id = _request AND status IN ('pending', 'quoted', 'approved');
  END IF;

  -- U&'\00B7' is a middle dot written as an escape, so it survives any client encoding.
  IF _client IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_client], 'We''ve received your item', _ref || U&' \00B7 ' || _title, '/projects/' || _id);
  END IF;
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('planning')),
    CASE _intake WHEN 'approved' THEN 'New project to plan: ' WHEN 'quote' THEN 'Quote needed: ' ELSE 'Evaluation needed: ' END || _ref,
    _title, '/projects/' || _id);
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_project(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project(jsonb) TO authenticated;

-- ---------------------------------------------------------------- 8. Daily reminder notices
-- Tells the owner (if they have a portal login) and the workshop when a service is due within
-- 14 days, or the reading is within 10% of the next service. Once per due cycle.
CREATE OR REPLACE FUNCTION public.send_asset_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _count integer := 0;
  _staff uuid[];
BEGIN
  IF NOT public.is_feature_enabled('assets') THEN RETURN 0; END IF;
  _staff := ARRAY(
    SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager')
    UNION SELECT public.permission_holders('reception')
  );
  FOR _row IN
    SELECT r.id, r.title, r.due_date, a.id AS asset_id, a.name, a.client_id
    FROM public.asset_reminders r
    JOIN public.assets a ON a.id = r.asset_id
    WHERE r.active AND a.archived_at IS NULL AND r.notified_at IS NULL
      AND (
        (r.due_date IS NOT NULL AND r.due_date <= current_date + 14)
        OR (r.due_meter IS NOT NULL AND a.meter_reading IS NOT NULL
            AND a.meter_reading >= r.due_meter - GREATEST(COALESCE(r.interval_meter, r.due_meter) * 0.1, 1))
      )
  LOOP
    IF _row.client_id IS NOT NULL AND public.is_feature_enabled('client_portal') THEN
      PERFORM public.notify_users(ARRAY[_row.client_id],
        _row.title || ' due: ' || _row.name,
        CASE WHEN _row.due_date IS NOT NULL THEN 'Due ' || to_char(_row.due_date, 'FMDD Mon YYYY') ELSE 'Due soon' END
          || '. Book it in from your portal.',
        '/client/assets');
    END IF;
    PERFORM public.notify_users(_staff,
      'Service due: ' || _row.name,
      _row.title || CASE WHEN _row.due_date IS NOT NULL THEN ', due ' || to_char(_row.due_date, 'FMDD Mon YYYY') ELSE '' END,
      '/assets/' || _row.asset_id);
    UPDATE public.asset_reminders SET notified_at = now() WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.send_asset_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_asset_reminders() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shoplane-asset-reminders') THEN
    PERFORM cron.unschedule('shoplane-asset-reminders');
  END IF;
  PERFORM cron.schedule('shoplane-asset-reminders', '0 7 * * *', 'SELECT public.send_asset_reminders()');
END $$;
