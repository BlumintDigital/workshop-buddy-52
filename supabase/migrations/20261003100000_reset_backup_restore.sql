-- Factory reset, backup and restore for the whole project lifecycle.
--
-- The edge functions used hard-coded table lists from before projects, teams,
-- quotes, stock requests, purchasing and shipping existed, read at most 1000
-- rows a table, and ran step by step so a failure could leave data half gone.
-- These functions do each job in one transaction from one list of tables.
-- They are for the service role only (the admin-checked edge functions).

-- Operational data: cleared by a reset and always replaced by a restore.
-- Parents before children.
CREATE OR REPLACE FUNCTION public.workshop_data_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
    'suppliers', 'inventory_items',
    'client_requests', 'request_quote_items',
    'jobs', 'project_ref_counters',
    'job_tasks', 'job_task_notes', 'job_comments', 'job_attachments', 'job_ratings',
    'project_events', 'project_quotes', 'project_quote_items',
    'task_handoffs', 'time_entries', 'shipments',
    'stock_requests', 'stock_request_items', 'purchase_orders', 'purchase_order_items',
    'invoices', 'invoice_items', 'invoice_pdf_versions', 'inventory_transactions',
    'appointments', 'notifications', 'bug_reports'
  ]::text[]
$$;

-- Workshop setup: kept by a data reset, cleared by a full reset, and replaced
-- by a restore only when the backup has it (older backups don't).
CREATE OR REPLACE FUNCTION public.workshop_setup_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
    'workshop_settings', 'feature_flags', 'signup_codes', 'broadcasts', 'system_notices',
    'departments', 'department_members', 'department_permissions', 'user_permissions',
    'labour_rates', 'monthly_revenue_goals', 'saved_reports'
  ]::text[]
$$;

-- Every column a row can be inserted with (generated columns are left out).
CREATE OR REPLACE FUNCTION public._insertable_columns(_table text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  FROM pg_attribute a
  WHERE a.attrelid = ('public.' || quote_ident(_table))::regclass
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
$$;

-- Fails if any foreign key in the public schema points at a missing row.
CREATE OR REPLACE FUNCTION public._assert_references_intact()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _fk record;
  _bad bigint;
  _problems text[] := '{}';
BEGIN
  FOR _fk IN
    SELECT c.conrelid::regclass AS child, ca.attname AS child_col,
           c.confrelid::regclass AS parent, pa.attname AS parent_col
    FROM pg_constraint c
    JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)',
      _fk.child, _fk.child_col, _fk.parent, _fk.parent_col, _fk.child_col
    ) INTO _bad;
    IF _bad > 0 THEN
      _problems := _problems || format('%s.%s (%s rows point at missing %s)', _fk.child, _fk.child_col, _bad, _fk.parent);
    END IF;
  END LOOP;
  IF array_length(_problems, 1) > 0 THEN
    RAISE EXCEPTION 'The backup does not fit this database: %', array_to_string(_problems, '; ')
      USING ERRCODE = '23503';
  END IF;
END;
$$;

-- Moves identity counters past the highest restored id.
CREATE OR REPLACE FUNCTION public._sync_identity(_table text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _col text; _seq text;
BEGIN
  FOR _col IN
    SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid = ('public.' || quote_ident(_table))::regclass AND a.attidentity <> '' AND a.attnum > 0
  LOOP
    _seq := pg_get_serial_sequence('public.' || quote_ident(_table), _col);
    IF _seq IS NOT NULL THEN
      EXECUTE format('SELECT setval(%L, COALESCE((SELECT max(%I) FROM public.%I), 0) + 1, false)', _seq, _col, _table);
    END IF;
  END LOOP;
END;
$$;

-- ── Factory reset ───────────────────────────────────────────────────────────
-- _full = false: clear projects, stock, billing and appointments; keep people
--   and workshop setup.
-- _full = true: also clear the workshop setup and everyone else's settings.
--   Accounts themselves are removed by the edge function.
CREATE OR REPLACE FUNCTION public.reset_workshop_data(_full boolean, _keep_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tables text[] := public.workshop_data_tables();
  _t text;
  _n bigint;
  _counts jsonb := '{}';
BEGIN
  IF _full THEN
    _tables := _tables || ARRAY['departments', 'department_members', 'department_permissions', 'user_permissions',
      'labour_rates', 'monthly_revenue_goals', 'saved_reports', 'signup_codes', 'broadcasts', 'dismissed_broadcasts',
      'system_notices', 'dismissed_notices'];
  END IF;

  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', _t) INTO _n;
    _counts := _counts || jsonb_build_object(_t, _n);
  END LOOP;

  -- One statement, so either everything is cleared or nothing is.
  EXECUTE 'TRUNCATE ' || (SELECT string_agg('public.' || quote_ident(t), ', ') FROM unnest(_tables) t);

  IF _full THEN
    DELETE FROM public.dashboard_prefs WHERE user_id IS DISTINCT FROM _keep_user;
    DELETE FROM public.admin_onboarding_progress WHERE user_id IS DISTINCT FROM _keep_user;
  END IF;

  FOREACH _t IN ARRAY _tables LOOP
    PERFORM public._sync_identity(_t);
  END LOOP;
  RETURN _counts;
END;
$$;

-- ── Backup ──────────────────────────────────────────────────────────────────
-- Every row of every table a restore needs, in one consistent snapshot.
-- Leaves out activity history, push subscriptions, MFA secrets, the platform
-- contact row and per-person screen preferences.
CREATE OR REPLACE FUNCTION public.export_workshop_data()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t text;
  _rows jsonb;
  _out jsonb := '{}';
BEGIN
  FOREACH _t IN ARRAY ARRAY['profiles', 'user_roles'] || public.workshop_setup_tables() || public.workshop_data_tables() LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x', _t) INTO _rows;
    _out := _out || jsonb_build_object(_t, _rows);
  END LOOP;
  RETURN _out;
END;
$$;

-- ── Restore ─────────────────────────────────────────────────────────────────
-- Replaces the workshop's data with a backup in one transaction. Triggers are
-- paused so nothing is re-notified or re-logged; every reference is checked at
-- the end and the whole restore rolls back if anything doesn't line up.
-- Accounts can't be restored, so profiles and roles are only updated for people
-- who still exist, and the admin running the restore keeps their role.
CREATE OR REPLACE FUNCTION public.restore_workshop_data(_data jsonb, _caller uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _t text;
  _cols text;
  _set text;
  _replace text[] := '{}';
  _counts jsonb := '{}';
  _n bigint;
BEGIN
  -- A SET statement (not set_config) is what Supabase lets the postgres role run.
  SET LOCAL session_replication_role = replica;

  -- Everything operational, plus whatever setup the backup carries.
  FOREACH _t IN ARRAY public.workshop_setup_tables() LOOP
    IF _data ? _t THEN _replace := _replace || _t; END IF;
  END LOOP;
  _replace := _replace || public.workshop_data_tables();

  -- Cascades are triggers too, so clear dependants by hand.
  IF 'broadcasts' = ANY (_replace) THEN DELETE FROM public.dismissed_broadcasts WHERE true; END IF;
  IF 'system_notices' = ANY (_replace) THEN DELETE FROM public.dismissed_notices WHERE true; END IF;
  FOREACH _t IN ARRAY _replace LOOP
    -- "WHERE true": API connections refuse a DELETE with no WHERE clause.
    EXECUTE format('DELETE FROM public.%I WHERE true', _t);
  END LOOP;

  FOREACH _t IN ARRAY _replace LOOP
    _cols := public._insertable_columns(_t);
    EXECUTE format(
      'INSERT INTO public.%1$I (%2$s) OVERRIDING SYSTEM VALUE SELECT %2$s FROM jsonb_populate_recordset(NULL::public.%1$I, $1)',
      _t, _cols
    ) USING COALESCE(_data -> _t, '[]'::jsonb);
    GET DIAGNOSTICS _n = ROW_COUNT;
    _counts := _counts || jsonb_build_object(_t, _n);
    PERFORM public._sync_identity(_t);
  END LOOP;

  -- People: only those who still have an account.
  _cols := public._insertable_columns('profiles');
  SELECT string_agg(format('%1$s = EXCLUDED.%1$s', c), ', ') INTO _set
  FROM unnest(string_to_array(_cols, ', ')) c WHERE c <> 'id';
  EXECUTE format(
    'INSERT INTO public.profiles (%1$s) SELECT %1$s FROM jsonb_populate_recordset(NULL::public.profiles, $1) r
     WHERE r.id IN (SELECT id FROM auth.users) ON CONFLICT (id) DO UPDATE SET %2$s',
    _cols, _set
  ) USING COALESCE(_data -> 'profiles', '[]'::jsonb);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _counts := _counts || jsonb_build_object('profiles', _n);

  -- Roles: take the backup's roles for those people, but never change the
  -- caller's, so the admin running the restore can't lock themselves out.
  IF _data ? 'user_roles' THEN
    CREATE TEMP TABLE _restore_roles ON COMMIT DROP AS
      SELECT * FROM jsonb_populate_recordset(NULL::public.user_roles, _data -> 'user_roles') r
      WHERE r.user_id IN (SELECT id FROM auth.users) AND r.user_id IS DISTINCT FROM _caller;
    DELETE FROM public.user_roles WHERE user_id IN (SELECT user_id FROM _restore_roles);
    _cols := public._insertable_columns('user_roles');
    EXECUTE format('INSERT INTO public.user_roles (%1$s) SELECT %1$s FROM _restore_roles ON CONFLICT DO NOTHING', _cols);
    GET DIAGNOSTICS _n = ROW_COUNT;
    _counts := _counts || jsonb_build_object('user_roles', _n);
  END IF;

  PERFORM public._assert_references_intact();
  RETURN _counts;
END;
$$;

REVOKE ALL ON FUNCTION public.workshop_data_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workshop_setup_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._insertable_columns(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_references_intact() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._sync_identity(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_workshop_data(boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.export_workshop_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_workshop_data(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_workshop_data(boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.export_workshop_data() TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_workshop_data(jsonb, uuid) TO service_role;
