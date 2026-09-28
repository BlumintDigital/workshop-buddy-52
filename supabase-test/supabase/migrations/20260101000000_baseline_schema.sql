


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Production's functions carry only the grants listed in this dump. A fresh
-- local database would also hand every new function to anon and authenticated,
-- so hold that back while the baseline loads (the end of this file restores it).
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM "anon", "authenticated", PUBLIC;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'manager',
    'staff',
    'client'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."broadcast_severity" AS ENUM (
    'info',
    'warning',
    'critical'
);


ALTER TYPE "public"."broadcast_severity" OWNER TO "postgres";


CREATE TYPE "public"."client_request_status" AS ENUM (
    'pending',
    'quoted',
    'accepted',
    'declined',
    'cancelled',
    'converted',
    'approved',
    'declined_by_client'
);


ALTER TYPE "public"."client_request_status" OWNER TO "postgres";


CREATE TYPE "public"."client_request_type" AS ENUM (
    'quote',
    'job'
);


ALTER TYPE "public"."client_request_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_assert_references_intact"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."_assert_references_intact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_insertable_columns"("_table" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  FROM pg_attribute a
  WHERE a.attrelid = ('public.' || quote_ident(_table))::regclass
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
$$;


ALTER FUNCTION "public"."_insertable_columns"("_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_sync_identity"("_table" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."_sync_identity"("_table" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_client_request"("_request_id" "uuid", "_assigned_staff_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _job_id uuid;
  _desc text;
  _quote_lines text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Admin or manager access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _req FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF _req.request_type = 'quote' THEN
    IF _req.status <> 'approved' THEN
      RAISE EXCEPTION 'Quote must be approved by the client before converting to a job' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF _req.status NOT IN ('pending') THEN
      RAISE EXCEPTION 'Request cannot be accepted in its current state' USING ERRCODE = '22023';
    END IF;
  END IF;

  _desc := COALESCE(_req.description, '');

  IF _req.request_type = 'quote' THEN
    SELECT string_agg('• ' || description || ' (x' || quantity || ' @ ' || unit_price || ')', E'\n')
      INTO _quote_lines
      FROM public.request_quote_items WHERE request_id = _req.id;
    IF _quote_lines IS NOT NULL THEN
      _desc := _desc || E'\n\n— Approved quote —\n' || _quote_lines;
      IF _req.quoted_total IS NOT NULL THEN
        _desc := _desc || E'\nTotal: ' || _req.quoted_total || ' ' || COALESCE(_req.quoted_currency, '');
      END IF;
      IF _req.quoted_notes IS NOT NULL AND length(_req.quoted_notes) > 0 THEN
        _desc := _desc || E'\nNotes: ' || _req.quoted_notes;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.jobs (title, description, priority, status, client_id, assigned_staff_id, due_date, source_request_id)
  VALUES (_req.title, _desc, _req.priority, 'pending', _req.client_id, _assigned_staff_id, _req.preferred_date, _req.id)
  RETURNING id INTO _job_id;

  UPDATE public.client_requests
    SET status = 'converted',
        converted_job_id = _job_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id;

  RETURN _job_id;
END;
$$;


ALTER FUNCTION "public"."accept_client_request"("_request_id" "uuid", "_assigned_staff_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_project_event"("_job_id" "uuid", "_kind" "text", "_data" "jsonb" DEFAULT '{}'::"jsonb", "_client_visible" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _actor uuid;
BEGIN
  BEGIN _actor := auth.uid(); EXCEPTION WHEN OTHERS THEN _actor := NULL; END;
  INSERT INTO public.project_events (job_id, kind, actor_id, data, client_visible)
  VALUES (_job_id, _kind, _actor, COALESCE(_data, '{}'::jsonb), _client_visible);
END;
$$;


ALTER FUNCTION "public"."add_project_event"("_job_id" "uuid", "_kind" "text", "_data" "jsonb", "_client_visible" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_onboarding_progress_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."admin_onboarding_progress_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_user_role"("_caller_user_id" "uuid", "_target_user_id" "uuid", "_role" "public"."app_role") RETURNS "public"."app_role"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _current_role public.app_role;
  _admin_count integer;
  _is_super_admin boolean;
BEGIN
  IF _caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(_caller_user_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required' USING ERRCODE = '22023';
  END IF;

  IF _target_user_id = _caller_user_id THEN
    RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(is_super_admin, false)
  INTO _is_super_admin
  FROM public.profiles
  WHERE id = _target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(_is_super_admin, false) THEN
    RAISE EXCEPTION 'Super admin accounts cannot be changed here' USING ERRCODE = '42501';
  END IF;

  SELECT role
  INTO _current_role
  FROM public.user_roles
  WHERE user_id = _target_user_id
  LIMIT 1;

  IF _current_role = 'admin'::public.app_role AND _role <> 'admin'::public.app_role THEN
    SELECT count(*)
    INTO _admin_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'::public.app_role
      AND COALESCE(p.is_super_admin, false) = false;

    IF _admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the final admin account' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_target_user_id, _role);

  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (
    _caller_user_id,
    'updated',
    'user_roles',
    _target_user_id::text,
    format('Role updated from %s to %s', COALESCE(_current_role::text, 'none'), _role::text),
    jsonb_build_object('target_user_id', _target_user_id, 'old_role', _current_role, 'new_role', _role)
  );

  RETURN _role;
END;
$$;


ALTER FUNCTION "public"."admin_set_user_role"("_caller_user_id" "uuid", "_target_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_approve_purchase"("_user_id" "uuid", "_amount" numeric) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR (public.has_permission(_user_id, 'inventory_approve')
          AND _amount <= COALESCE((SELECT purchase_manager_limit FROM public.workshop_settings WHERE id = 1), 0));
$$;


ALTER FUNCTION "public"."can_approve_purchase"("_user_id" "uuid", "_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_quote"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_permission(_user_id, 'reception') OR public.has_permission(_user_id, 'planning');
$$;


ALTER FUNCTION "public"."can_quote"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_run_job"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_permission(_user_id, 'reception') OR public.has_permission(_user_id, 'planning')
      OR public.has_permission(_user_id, 'quality') OR public.has_permission(_user_id, 'shipping');
$$;


ALTER FUNCTION "public"."can_run_job"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_job"("_user_id" "uuid", "_job_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _job_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin'::public.app_role) OR public.has_role(_user_id, 'manager'::public.app_role) THEN true
    WHEN public.has_role(_user_id, 'client'::public.app_role) THEN EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.client_id = _user_id)
    ELSE
      EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.assigned_staff_id = _user_id)
      OR EXISTS (
        SELECT 1 FROM public.job_tasks t
        WHERE t.job_id = _job_id
          AND (t.assigned_to = _user_id
               OR t.department_id IN (SELECT m.department_id FROM public.department_members m WHERE m.user_id = _user_id))
      )
      OR public.has_permission(_user_id, 'reception')
      OR public.has_permission(_user_id, 'planning')
      OR public.has_permission(_user_id, 'quality')
      OR public.has_permission(_user_id, 'shipping')
      OR public.has_permission(_user_id, 'inventory')
  END;
$$;


ALTER FUNCTION "public"."can_view_job"("_user_id" "uuid", "_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_job_path"("_user_id" "uuid", "_folder" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.can_view_job(_user_id, _folder::uuid);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."can_view_job_path"("_user_id" "uuid", "_folder" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."choose_handover"("_job_id" "uuid", "_method" "text", "_preferred_date" "date" DEFAULT NULL::"date", "_address" "text" DEFAULT NULL::"text", "_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.shipments%ROWTYPE;
  _job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF NOT FOUND OR NOT (_job.client_id = _uid OR public.has_permission(_uid, 'shipping')) THEN
    RAISE EXCEPTION 'You can''t arrange delivery for this project' USING ERRCODE = '42501';
  END IF;
  IF _method NOT IN ('pickup', 'courier') THEN RAISE EXCEPTION 'Choose collection or delivery' USING ERRCODE = '22023'; END IF;
  IF _method = 'courier' AND (_address IS NULL OR length(trim(_address)) = 0) THEN RAISE EXCEPTION 'Add the delivery address' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND OR _s.status NOT IN ('ready', 'awaiting_client', 'scheduled') THEN RAISE EXCEPTION 'This project isn''t ready for collection or delivery yet' USING ERRCODE = '22023'; END IF;
  UPDATE public.shipments
    SET status = 'scheduled', method = _method, preferred_date = _preferred_date,
        delivery_address = CASE WHEN _method = 'courier' THEN trim(_address) ELSE NULL END,
        client_notes = NULLIF(trim(COALESCE(_notes, '')), ''), choice_made_at = now()
    WHERE id = _s.id;
  PERFORM public.add_project_event(_job_id, 'handover_chosen', jsonb_build_object('method', _method, 'date', _preferred_date), true);
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('shipping')),
    CASE WHEN _method = 'pickup' THEN 'Collection booked: ' ELSE 'Delivery requested: ' END || _job.ref,
    _job.title || CASE WHEN _preferred_date IS NOT NULL THEN ' · ' || to_char(_preferred_date, 'DD Mon') ELSE '' END,
    '/shipping');
END;
$$;


ALTER FUNCTION "public"."choose_handover"("_job_id" "uuid", "_method" "text", "_preferred_date" "date", "_address" "text", "_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_decide_quote"("_request_id" "uuid", "_approve" boolean, "_reason" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _req FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _req.client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the requesting client can respond to this quote' USING ERRCODE = '42501';
  END IF;
  IF _req.status <> 'quoted' THEN
    RAISE EXCEPTION 'No quote is awaiting your decision' USING ERRCODE = '22023';
  END IF;

  _new_status := CASE WHEN _approve THEN 'approved' ELSE 'declined_by_client' END;

  UPDATE public.client_requests
    SET status = _new_status::public.client_request_status,
        client_decision_at = now(),
        decline_reason = CASE WHEN _approve THEN NULL ELSE _reason END
    WHERE id = _request_id;

  RETURN _new_status;
END;
$$;


ALTER FUNCTION "public"."client_decide_quote"("_request_id" "uuid", "_approve" boolean, "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_mark_invoice_paid"("_invoice_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _row public.invoices%ROWTYPE;
  _ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the invoice client can mark it paid' USING ERRCODE = '42501';
  END IF;
  IF _row.status = 'paid' THEN
    RAISE EXCEPTION 'Invoice is already paid' USING ERRCODE = '22023';
  END IF;
  IF _row.status NOT IN ('sent','overdue') THEN
    RAISE EXCEPTION 'Invoice is not awaiting payment' USING ERRCODE = '22023';
  END IF;
  UPDATE public.invoices SET client_marked_paid_at = _ts WHERE id = _invoice_id;
  RETURN _ts;
END;
$$;


ALTER FUNCTION "public"."client_mark_invoice_paid"("_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invoice_on_job_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _invoice uuid;
  _subtotal numeric;
  _tax_rate numeric;
  _currency text;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.client_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.invoices WHERE job_id = NEW.id AND status <> 'cancelled') THEN
    SELECT COALESCE(default_tax_rate, 0), COALESCE(currency, 'USD') INTO _tax_rate, _currency FROM public.workshop_settings WHERE id = 1;
    SELECT COALESCE((SELECT q.currency FROM public.project_quotes q WHERE q.job_id = NEW.id AND q.status = 'accepted' AND q.currency IS NOT NULL LIMIT 1), _currency) INTO _currency;
    SELECT COALESCE(round(sum(i.quantity * i.unit_price), 2), 0) INTO _subtotal
      FROM public.project_quote_items i JOIN public.project_quotes q ON q.id = i.quote_id
      WHERE q.job_id = NEW.id AND q.status = 'accepted';

    INSERT INTO public.invoices (invoice_number, client_id, job_id, status, subtotal, tax_rate, tax_amount, total, currency)
    VALUES (
      'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4)),
      NEW.client_id, NEW.id, 'draft',
      _subtotal, COALESCE(_tax_rate, 0), round(_subtotal * COALESCE(_tax_rate, 0) / 100, 2), round(_subtotal * (1 + COALESCE(_tax_rate, 0) / 100), 2),
      COALESCE(_currency, 'USD')
    ) RETURNING id INTO _invoice;

    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    SELECT _invoice,
           CASE WHEN q.kind = 'change' THEN 'Change CR' || q.number || ': ' ELSE '' END || i.description,
           i.quantity, i.unit_price, round(i.quantity * i.unit_price, 2)
    FROM public.project_quote_items i JOIN public.project_quotes q ON q.id = i.quote_id
    WHERE q.job_id = NEW.id AND q.status = 'accepted'
    ORDER BY q.kind DESC, q.number, i.position;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_invoice_on_job_completed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_project"("_p" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _intake text := COALESCE(_p->>'intake_type', 'approved');
  _client uuid := NULLIF(_p->>'client_id', '')::uuid;
  _request uuid := NULLIF(_p->>'source_request_id', '')::uuid;
  _ref text;
  _title text := trim(COALESCE(_p->>'title', ''));
BEGIN
  IF NOT public.has_permission(_uid, 'reception') THEN RAISE EXCEPTION 'You can''t log new projects' USING ERRCODE = '42501'; END IF;
  IF length(_title) = 0 THEN RAISE EXCEPTION 'Describe the machine or the work' USING ERRCODE = '22023'; END IF;
  IF _intake NOT IN ('evaluation', 'quote', 'approved') THEN RAISE EXCEPTION 'Unknown intake type' USING ERRCODE = '22023'; END IF;
  IF _client IS NOT NULL AND NOT public.has_role(_client, 'client'::public.app_role) THEN
    RAISE EXCEPTION 'That person isn''t a client' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.jobs (
    title, description, priority, status, intake_type, client_id, assigned_staff_id, due_date, estimated_hours,
    make_model, serial_number, accessories, condition_notes, contact_name, contact_phone, contact_email,
    received_by, received_at, source_request_id
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
    _uid, now(), _request
  ) RETURNING id, ref INTO _id, _ref;

  IF _request IS NOT NULL THEN
    UPDATE public.client_requests
      SET status = 'converted', converted_job_id = _id, reviewed_by = _uid, reviewed_at = now()
      WHERE id = _request AND status IN ('pending', 'quoted', 'approved');
  END IF;

  IF _client IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_client], 'We''ve received your item', _ref || ' · ' || _title, '/projects/' || _id);
  END IF;
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('planning')),
    CASE _intake WHEN 'approved' THEN 'New project to plan: ' WHEN 'quote' THEN 'Quote needed: ' ELSE 'Evaluation needed: ' END || _ref,
    _title, '/projects/' || _id);
  RETURN _id;
END;
$$;


ALTER FUNCTION "public"."create_project"("_p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_project_quote"("_quote_id" "uuid", "_accept" boolean, "_note" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _q public.project_quotes%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _label text;
  _status text := CASE WHEN _accept THEN 'accepted' ELSE 'declined' END;
BEGIN
  SELECT * INTO _q FROM public.project_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _q.job_id FOR UPDATE;
  IF NOT (_job.client_id = _uid OR (NOT public.has_role(_uid, 'client'::public.app_role) AND public.can_quote(_uid))) THEN
    RAISE EXCEPTION 'Only the client can decide on this quote' USING ERRCODE = '42501';
  END IF;
  IF _q.status <> 'sent' THEN RAISE EXCEPTION 'This quote isn''t waiting for a decision' USING ERRCODE = '22023'; END IF;
  _label := public.project_quote_label(_q.job_id, _q.kind, _q.number);

  UPDATE public.project_quotes
    SET status = _status, decided_at = now(), decided_by = _uid, decision_note = NULLIF(trim(COALESCE(_note, '')), '')
    WHERE id = _quote_id;
  PERFORM public.add_project_event(_q.job_id, CASE WHEN _accept THEN 'quote_accepted' ELSE 'quote_declined' END,
    jsonb_build_object('label', CASE WHEN _q.kind = 'quote' THEN 'Quote ' ELSE 'Change request ' END || _label, 'reason', _note,
                       'recorded_by_team', _job.client_id IS DISTINCT FROM _uid), true);

  IF _q.kind = 'quote' AND _accept THEN
    -- One accepted quote per project: any other open quote is superseded.
    UPDATE public.project_quotes SET status = 'withdrawn' WHERE job_id = _q.job_id AND kind = 'quote' AND id <> _quote_id AND status IN ('draft', 'pending_approval', 'sent');
    IF _job.status IN ('received', 'evaluation', 'quote') THEN
      UPDATE public.jobs SET status = 'pending' WHERE id = _q.job_id;
    END IF;
  END IF;

  PERFORM public.notify_users(
    ARRAY(SELECT public.permission_holders('planning')) || ARRAY[_q.created_by, _job.assigned_staff_id],
    CASE WHEN _accept THEN 'Accepted: ' ELSE 'Declined: ' END || _label,
    _job.title || CASE WHEN _note IS NOT NULL AND length(trim(_note)) > 0 THEN ' · ' || left(trim(_note), 120) ELSE '' END,
    '/projects/' || _q.job_id);
  RETURN _status;
END;
$$;


ALTER FUNCTION "public"."decide_project_quote"("_quote_id" "uuid", "_accept" boolean, "_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_purchase_order"("_po_id" "uuid", "_approve" boolean, "_note" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = 'P0002'; END IF;
  IF _po.status <> 'pending_approval' THEN RAISE EXCEPTION 'This order isn''t waiting for approval' USING ERRCODE = '22023'; END IF;
  IF NOT public.can_approve_purchase(_uid, _po.subtotal) THEN
    RAISE EXCEPTION 'This order is over your approval limit. An admin needs to approve it.' USING ERRCODE = '42501';
  END IF;
  IF NOT _approve AND (_note IS NULL OR length(trim(_note)) = 0) THEN RAISE EXCEPTION 'Say why it''s rejected' USING ERRCODE = '22023'; END IF;
  UPDATE public.purchase_orders
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        approved_by = _uid, approved_at = now(), decision_note = NULLIF(trim(COALESCE(_note, '')), '')
    WHERE id = _po_id;
  PERFORM public.notify_users(ARRAY[_po.created_by],
    CASE WHEN _approve THEN 'Approved: ' ELSE 'Rejected: ' END || _po.po_number,
    COALESCE(NULLIF(trim(COALESCE(_note, '')), ''), CASE WHEN _approve THEN 'You can place the order.' ELSE '' END), '/inventory/purchases');
  RETURN CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;
END;
$$;


ALTER FUNCTION "public"."decide_purchase_order"("_po_id" "uuid", "_approve" boolean, "_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_client_request"("_request_id" "uuid", "_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _client uuid;
  _title text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_permission(auth.uid(), 'reception') THEN RAISE EXCEPTION 'Reception access required' USING ERRCODE = '42501'; END IF;
  UPDATE public.client_requests
    SET status = 'declined', decline_reason = _reason, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id AND status IN ('pending', 'quoted')
    RETURNING client_id, title INTO _client, _title;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already finalised' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.notify_users(ARRAY[_client], 'Update on your request', _title || CASE WHEN _reason IS NOT NULL AND length(trim(_reason)) > 0 THEN ': ' || left(trim(_reason), 150) ELSE '' END, '/client/requests');
END;
$$;


ALTER FUNCTION "public"."decline_client_request"("_request_id" "uuid", "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_workshop_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."export_workshop_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_job_completion_stats"() RETURNS TABLE("status" "text", "count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_job_completion_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_bookings"() RETURNS TABLE("month" "text", "count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_monthly_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_revenue"() RETURNS TABLE("month" "text", "revenue" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_enabled('reports') THEN
    RAISE EXCEPTION 'Reports feature is disabled' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT to_char(i.paid_at, 'YYYY-MM'), sum(i.base_total)
    FROM public.invoices i
    WHERE i.status = 'paid' AND i.paid_at >= (now() - interval '12 months')
    GROUP BY 1 ORDER BY 1;
END;
$$;


ALTER FUNCTION "public"."get_monthly_revenue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_basic_profile"() RETURNS TABLE("full_name" "text", "avatar_url" "text", "invite_accepted_at" timestamp with time zone, "company_name" "text", "phone" "text", "address" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.full_name, p.avatar_url, p.invite_accepted_at, p.company_name, p.phone, p.address
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_my_basic_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("_user_id" "uuid") RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_user_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."goal_summary"("_from" timestamp with time zone, "_to" timestamp with time zone) RETURNS TABLE("delivered_value" numeric, "projects_finished" bigint, "projects_shipped" bigint, "hours_logged" numeric, "handoffs" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH finished AS (
    SELECT DISTINCT e.job_id FROM public.project_events e
    WHERE e.kind = 'status' AND e.data->>'to' = 'completed' AND e.created_at >= _from AND e.created_at <= _to
  )
  SELECT
    COALESCE((SELECT sum(q.subtotal) FROM public.project_quotes q WHERE q.status = 'accepted' AND q.job_id IN (SELECT job_id FROM finished)), 0),
    (SELECT count(*) FROM finished),
    (SELECT count(*) FROM public.shipments s WHERE s.shipped_at >= _from AND s.shipped_at <= _to),
    COALESCE((SELECT sum(hours) FROM public.time_entries WHERE work_date >= _from::date AND work_date <= _to::date), 0),
    (SELECT count(*) FROM public.task_handoffs WHERE created_at >= _from AND created_at <= _to)
  WHERE auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'client'::public.app_role);
$$;


ALTER FUNCTION "public"."goal_summary"("_from" timestamp with time zone, "_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _role app_role;
BEGIN
  BEGIN
    _role := (NEW.raw_user_meta_data->>'role')::app_role;
  EXCEPTION WHEN others THEN
    _role := 'client';
  END;
  IF _role IS NULL THEN _role := 'client'; END IF;

  INSERT INTO public.profiles (id, full_name, company_name, contact_person)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'company_name', '')), ''),
      NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'contact_person', '')), '')
    )
    ON CONFLICT (id) DO UPDATE
      SET full_name      = EXCLUDED.full_name,
          company_name   = EXCLUDED.company_name,
          contact_person = COALESCE(EXCLUDED.contact_person, profiles.contact_person);

  -- user_roles has UNIQUE (user_id, role), not UNIQUE (user_id).
  -- Replace any existing roles for this user so we end up with exactly one.
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handoff_task"("_task_id" "uuid", "_note" "text", "_hours" numeric DEFAULT NULL::numeric, "_next_task_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.job_tasks%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _next public.job_tasks%ROWTYPE;
  _id uuid;
  _remaining int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in to hand off a task' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _task FROM public.job_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002'; END IF;
  IF _task.status = 'completed' THEN RAISE EXCEPTION 'This task is already handed off' USING ERRCODE = '22023'; END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN RAISE EXCEPTION 'Add a handoff note' USING ERRCODE = '22023'; END IF;

  -- The assignee hands off; so can anyone in the task's team if nobody is assigned, and planners or managers.
  IF NOT (
    _task.assigned_to = _uid
    OR (_task.assigned_to IS NULL AND _task.department_id IN (SELECT department_id FROM public.department_members WHERE user_id = _uid))
    OR public.has_permission(_uid, 'planning')
  ) THEN
    RAISE EXCEPTION 'Only the person assigned to this task can hand it off' USING ERRCODE = '42501';
  END IF;

  IF _next_task_id IS NOT NULL THEN
    SELECT * INTO _next FROM public.job_tasks WHERE id = _next_task_id;
    IF NOT FOUND OR _next.job_id <> _task.job_id OR _next.id = _task.id THEN
      RAISE EXCEPTION 'The next step must be another task on this project' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.job_tasks
    SET status = 'completed', completed_at = now(), completed_by = _uid,
        assigned_to = COALESCE(assigned_to, _uid)
    WHERE id = _task_id;

  INSERT INTO public.task_handoffs (task_id, job_id, from_user, note, hours, next_task_id)
  VALUES (_task_id, _task.job_id, _uid, trim(_note), _hours, _next_task_id)
  RETURNING id INTO _id;

  IF _hours IS NOT NULL AND _hours > 0 THEN
    INSERT INTO public.time_entries (job_id, task_id, user_id, hours, note)
    VALUES (_task.job_id, _task_id, _uid, _hours, 'Logged at handoff');
  END IF;

  PERFORM public.add_project_event(_task.job_id, 'handoff',
    jsonb_build_object('task', _task.title, 'task_id', _task_id, 'next', _next.title, 'hours', _hours));

  SELECT * INTO _job FROM public.jobs WHERE id = _task.job_id FOR UPDATE;

  -- Tell whoever is next: the next task's person, or everyone in its team.
  IF _next.id IS NOT NULL THEN
    PERFORM public.notify_users(
      CASE WHEN _next.assigned_to IS NOT NULL THEN ARRAY[_next.assigned_to]
           ELSE ARRAY(SELECT user_id FROM public.department_members WHERE department_id = _next.department_id) END,
      'Your turn: ' || _next.title,
      '"' || _task.title || '" is done on ' || _job.ref || '. ' || left(trim(_note), 120),
      '/projects/' || _task.job_id);
  END IF;

  -- Every task done: the project is ready for its quality check.
  SELECT count(*) INTO _remaining FROM public.job_tasks WHERE job_id = _task.job_id AND status <> 'completed';
  IF _remaining = 0 AND _job.status IN ('pending', 'in_progress') THEN
    UPDATE public.jobs SET status = 'review' WHERE id = _task.job_id;
    PERFORM public.notify_users(
      COALESCE(NULLIF(ARRAY(SELECT public.permission_holders('quality')), '{}'),
               ARRAY(SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager'))),
      'Ready for quality check: ' || _job.ref,
      'Every task on "' || _job.title || '" is handed off.',
      '/projects/' || _task.job_id);
  ELSIF _job.status = 'pending' THEN
    -- The first handoff means work has started.
    UPDATE public.jobs SET status = 'in_progress' WHERE id = _task.job_id;
  END IF;

  RETURN _id;
END;
$$;


ALTER FUNCTION "public"."handoff_task"("_task_id" "uuid", "_note" "text", "_hours" numeric, "_next_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin'::public.app_role) THEN true
    WHEN public.has_role(_user_id, 'client'::public.app_role) THEN false
    WHEN public.has_role(_user_id, 'manager'::public.app_role) THEN true
    ELSE EXISTS (SELECT 1 FROM public.user_permissions up WHERE up.user_id = _user_id AND up.permission = _permission)
      OR EXISTS (
        SELECT 1 FROM public.department_members m
        JOIN public.department_permissions dp ON dp.department_id = m.department_id
        WHERE m.user_id = _user_id AND dp.permission = _permission
      )
  END;
$$;


ALTER FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_feature_enabled"("feature_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN feature_key IN ('appointments','client_portal','goals','reports','job_chat')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), true)
    WHEN feature_key IN ('generate_sample_data','setup_demo_users')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), false)
    ELSE false
  END;
$$;


ALTER FUNCTION "public"."is_feature_enabled"("feature_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_storekeeper"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_permission(_user_id, 'inventory');
$$;


ALTER FUNCTION "public"."is_storekeeper"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_parts"("_request_item_id" "uuid", "_quantity" numeric, "_item_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _line public.stock_request_items%ROWTYPE;
  _req public.stock_requests%ROWTYPE;
  _stock public.inventory_items%ROWTYPE;
  _job public.jobs%ROWTYPE;
BEGIN
  IF NOT public.is_storekeeper(_uid) THEN RAISE EXCEPTION 'Only stores can issue parts' USING ERRCODE = '42501'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Enter how many to issue' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _line FROM public.stock_request_items WHERE id = _request_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request line not found' USING ERRCODE = 'P0002'; END IF;
  IF _line.status IN ('issued', 'cancelled') THEN RAISE EXCEPTION 'This line is already closed' USING ERRCODE = '22023'; END IF;
  IF _item_id IS NOT NULL THEN
    UPDATE public.stock_request_items SET item_id = _item_id WHERE id = _line.id;
    _line.item_id := _item_id;
  END IF;
  IF _line.item_id IS NULL THEN RAISE EXCEPTION 'Pick the stock item to issue' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _stock FROM public.inventory_items WHERE id = _line.item_id FOR UPDATE;
  IF _stock.quantity < _quantity THEN
    RAISE EXCEPTION 'Only % % in stock', trim(to_char(_stock.quantity, 'FM999999990.##')), _stock.unit USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _req FROM public.stock_requests WHERE id = _line.request_id;
  SELECT * INTO _job FROM public.jobs WHERE id = _req.job_id;

  UPDATE public.inventory_items SET quantity = quantity - _quantity WHERE id = _stock.id;
  INSERT INTO public.inventory_transactions (item_id, job_id, user_id, type, quantity, notes)
  VALUES (_stock.id, _req.job_id, _uid, 'out', _quantity, 'Issued for ' || _job.ref);
  UPDATE public.stock_request_items
    SET quantity_issued = quantity_issued + _quantity,
        status = CASE WHEN quantity_issued + _quantity >= quantity THEN 'issued' ELSE status END
    WHERE id = _line.id;
  PERFORM public.refresh_stock_request(_req.id);
  PERFORM public.add_project_event(_req.job_id, 'parts_issued',
    jsonb_build_object('summary', _stock.name || ' × ' || trim(to_char(_quantity, 'FM999999990.##'))));
  PERFORM public.notify_users(ARRAY[_req.requested_by], 'Parts ready: ' || _stock.name, _job.ref || ' · ' || trim(to_char(_quantity, 'FM999999990.##')) || ' ' || _stock.unit, '/projects/' || _req.job_id);
END;
$$;


ALTER FUNCTION "public"."issue_parts"("_request_item_id" "uuid", "_quantity" numeric, "_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_attachments_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A client's upload is always a client file, whatever the app sent.
    IF public.has_role(NEW.uploaded_by, 'client'::public.app_role) THEN
      NEW.kind := 'client';
    END IF;
    RETURN NEW;
  END IF;

  -- Intake photos record the machine's condition on arrival: only an admin may change or remove them.
  IF OLD.kind = 'intake' AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Intake photos can only be changed by an admin' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."job_attachments_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."job_tasks_start_project"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    UPDATE public.jobs SET status = 'in_progress' WHERE id = NEW.job_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."job_tasks_start_project"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_assign_ref"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ref := public.next_project_ref(COALESCE(NEW.created_at, now()));
  ELSIF NEW.ref IS DISTINCT FROM OLD.ref THEN
    NEW.ref := OLD.ref;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."jobs_assign_ref"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_open_shipment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.shipments (job_id) VALUES (NEW.id) ON CONFLICT (job_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."jobs_open_shipment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jobs_record_events"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.add_project_event(NEW.id, 'created', jsonb_build_object('status', NEW.status), true);
    IF NEW.assigned_staff_id IS NOT NULL THEN
      PERFORM public.add_project_event(NEW.id, 'assigned', jsonb_build_object('to', NEW.assigned_staff_id));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.add_project_event(NEW.id, 'status', jsonb_build_object('from', OLD.status, 'to', NEW.status), true);
  END IF;
  IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
    PERFORM public.add_project_event(NEW.id, 'assigned', jsonb_build_object('from', OLD.assigned_staff_id, 'to', NEW.assigned_staff_id));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."jobs_record_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_access_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _row jsonb := to_jsonb(COALESCE(NEW, OLD));
  _summary text;
BEGIN
  _summary := CASE TG_TABLE_NAME
    WHEN 'user_permissions' THEN 'Permission "' || (_row->>'permission') || '" ' || CASE WHEN TG_OP = 'DELETE' THEN 'removed' ELSE 'granted' END
    WHEN 'department_permissions' THEN 'Team permission "' || (_row->>'permission') || '" ' || CASE WHEN TG_OP = 'DELETE' THEN 'removed' ELSE 'added' END
    WHEN 'department_members' THEN CASE WHEN TG_OP = 'DELETE' THEN 'Removed from a team' WHEN TG_OP = 'UPDATE' THEN 'Team lead changed' ELSE 'Added to a team' END
    ELSE TG_TABLE_NAME || ' ' || lower(TG_OP)
  END;
  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (auth.uid(), lower(TG_OP), TG_TABLE_NAME, COALESCE(_row->>'user_id', _row->>'department_id'), _summary, _row);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_access_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _action text;
  _record_id text;
  _user_id uuid;
  _summary text;
  _details jsonb := '{}'::jsonb;
  _table text := TG_TABLE_NAME;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _record_id := NEW.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _record_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _record_id := OLD.id::text;
  END IF;

  BEGIN
    _user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _user_id := NULL;
  END;

  IF _table = 'jobs' THEN
    IF TG_OP = 'DELETE' THEN
      _summary := 'Job "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN
      _summary := 'Job "' || NEW.title || '" was created';
    ELSE
      _summary := 'Job "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        _details := _details || jsonb_build_object('status_change', OLD.status || ' → ' || NEW.status);
      END IF;
      IF OLD.assigned_staff_id IS DISTINCT FROM NEW.assigned_staff_id THEN
        _details := _details || jsonb_build_object('staff_assignment', jsonb_build_object(
          'from', COALESCE(OLD.assigned_staff_id::text, ''),
          'to',   COALESCE(NEW.assigned_staff_id::text, '')
        ));
      END IF;
    END IF;
  ELSIF _table = 'appointments' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Appointment "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Appointment "' || NEW.title || '" was created';
    ELSE _summary := 'Appointment "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' → ' || NEW.status); END IF;
    END IF;
  ELSIF _table = 'invoices' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Invoice ' || OLD.invoice_number || ' was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Invoice ' || NEW.invoice_number || ' was created';
    ELSE _summary := 'Invoice ' || NEW.invoice_number || ' was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' → ' || NEW.status); END IF;
    END IF;
  ELSIF _table = 'inventory_items' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Inventory item "' || OLD.name || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Inventory item "' || NEW.name || '" was created';
    ELSE _summary := 'Inventory item "' || NEW.name || '" was updated';
      IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN _details := jsonb_build_object('quantity_change', OLD.quantity || ' → ' || NEW.quantity); END IF;
    END IF;
  ELSIF _table = 'profiles' THEN
    IF TG_OP = 'UPDATE' THEN _summary := 'Profile for "' || COALESCE(NEW.full_name, NEW.company_name, 'Unknown') || '" was updated';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Profile for "' || COALESCE(NEW.full_name, NEW.company_name, 'Unknown') || '" was created';
    ELSE _summary := 'Profile was deleted';
    END IF;
  ELSIF _table = 'user_roles' THEN
    IF TG_OP = 'INSERT' THEN _summary := 'Role "' || NEW.role || '" was assigned'; _details := jsonb_build_object('target_user', NEW.user_id);
    ELSIF TG_OP = 'UPDATE' THEN _summary := 'Role changed from "' || OLD.role || '" to "' || NEW.role || '"'; _details := jsonb_build_object('target_user', NEW.user_id);
    ELSIF TG_OP = 'DELETE' THEN _summary := 'Role "' || OLD.role || '" was removed'; _details := jsonb_build_object('target_user', OLD.user_id);
    END IF;
  ELSIF _table = 'job_tasks' THEN
    IF TG_OP = 'DELETE' THEN _summary := 'Task "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Task "' || NEW.title || '" was created';
    ELSE _summary := 'Task "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' → ' || NEW.status); END IF;
    END IF;
  ELSE
    _summary := _table || ' record was ' || _action;
  END IF;

  INSERT INTO public.activity_logs (user_id, action, table_name, record_id, summary, details)
  VALUES (_user_id, _action, _table, _record_id, _summary, _details);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;


ALTER FUNCTION "public"."log_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_purchase_ordered"("_po_id" "uuid", "_expected" "date" DEFAULT NULL::"date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_storekeeper(auth.uid()) THEN RAISE EXCEPTION 'Only stores can place orders' USING ERRCODE = '42501'; END IF;
  UPDATE public.purchase_orders SET status = 'ordered', ordered_at = now(), expected_at = COALESCE(_expected, expected_at)
    WHERE id = _po_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an approved order can be placed' USING ERRCODE = '22023'; END IF;
  UPDATE public.stock_request_items SET status = 'ordering'
    WHERE id IN (SELECT request_item_id FROM public.purchase_order_items WHERE po_id = _po_id AND request_item_id IS NOT NULL) AND status = 'open';
END;
$$;


ALTER FUNCTION "public"."mark_purchase_ordered"("_po_id" "uuid", "_expected" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_shipped"("_job_id" "uuid", "_d" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.shipments%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _method text;
  _detail text;
BEGIN
  IF NOT public.has_permission(_uid, 'shipping') THEN RAISE EXCEPTION 'Only shipping can mark items as shipped' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = 'P0002'; END IF;
  IF _s.status = 'shipped' THEN RAISE EXCEPTION 'Already shipped' USING ERRCODE = '22023'; END IF;
  _method := COALESCE(NULLIF(_d->>'method', ''), _s.method);
  IF _method = 'pickup' AND length(trim(COALESCE(_d->>'collector_name', ''))) = 0 THEN RAISE EXCEPTION 'Record who collected it' USING ERRCODE = '22023'; END IF;
  IF _method = 'courier' AND length(trim(COALESCE(_d->>'carrier', ''))) = 0 THEN RAISE EXCEPTION 'Record the courier' USING ERRCODE = '22023'; END IF;
  IF _method IS NULL THEN RAISE EXCEPTION 'Choose collection or courier' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;

  UPDATE public.shipments SET
    status = 'shipped', method = _method,
    collector_name = NULLIF(trim(COALESCE(_d->>'collector_name', '')), ''),
    collector_id_number = NULLIF(trim(COALESCE(_d->>'collector_id_number', '')), ''),
    collector_phone = NULLIF(trim(COALESCE(_d->>'collector_phone', '')), ''),
    vehicle_make = NULLIF(trim(COALESCE(_d->>'vehicle_make', '')), ''),
    vehicle_registration = NULLIF(upper(trim(COALESCE(_d->>'vehicle_registration', ''))), ''),
    carrier = NULLIF(trim(COALESCE(_d->>'carrier', '')), ''),
    tracking_number = NULLIF(trim(COALESCE(_d->>'tracking_number', '')), ''),
    tracking_url = NULLIF(trim(COALESCE(_d->>'tracking_url', '')), ''),
    shipping_cost = NULLIF(_d->>'shipping_cost', '')::numeric,
    currency = COALESCE(NULLIF(_d->>'currency', ''), currency),
    shipped_at = now(), shipped_by = _uid
  WHERE id = _s.id;

  UPDATE public.jobs SET status = 'shipped' WHERE id = _job_id;
  _detail := CASE WHEN _method = 'pickup'
    THEN 'Collected by ' || trim(_d->>'collector_name')
    ELSE trim(_d->>'carrier') || COALESCE(' · ' || NULLIF(trim(COALESCE(_d->>'tracking_number', '')), ''), '') END;
  PERFORM public.add_project_event(_job_id, 'shipped', jsonb_build_object('method', _method, 'detail', _detail), true);
  IF _job.client_id IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_job.client_id],
      CASE WHEN _method = 'pickup' THEN 'Collected: ' ELSE 'On its way: ' END || _job.ref, _detail, '/projects/' || _job_id);
  END IF;
END;
$$;


ALTER FUNCTION "public"."mark_shipped"("_job_id" "uuid", "_d" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_permissions"() RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(array_agg(p ORDER BY p), '{}'::text[])
  FROM unnest(public.permission_keys()) AS p
  WHERE public.has_permission(auth.uid(), p);
$$;


ALTER FUNCTION "public"."my_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_project_ref"("_at" timestamp with time zone DEFAULT "now"()) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _period text := to_char(_at AT TIME ZONE 'UTC', 'YYYYMM');
  _prefix text;
  _n integer;
BEGIN
  SELECT COALESCE(project_ref_prefix, 'EDL') INTO _prefix FROM public.workshop_settings WHERE id = 1;
  _prefix := COALESCE(_prefix, 'EDL');

  INSERT INTO public.project_ref_counters AS c (period, last_value)
  VALUES (_period, 1)
  ON CONFLICT (period) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO _n;

  -- At least three digits; a 1000th project in one month becomes -1000, never a truncated -100.
  RETURN _prefix || '-' || _period || '-' || CASE WHEN _n < 1000 THEN lpad(_n::text, 3, '0') ELSE _n::text END;
END;
$$;


ALTER FUNCTION "public"."next_project_ref"("_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_ready_to_ship"("_job_id" "uuid", "_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _s public.shipments%ROWTYPE;
  _job public.jobs%ROWTYPE;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'shipping') THEN RAISE EXCEPTION 'Only shipping can do this' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = 'P0002'; END IF;
  IF _s.status = 'shipped' THEN RAISE EXCEPTION 'Already shipped' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  UPDATE public.shipments SET status = CASE WHEN status = 'ready' THEN 'awaiting_client' ELSE status END, notified_at = now() WHERE id = _s.id;
  PERFORM public.add_project_event(_job_id, 'shipment_notified', jsonb_build_object('message', _message), true);
  IF _job.client_id IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_job.client_id], 'Your item is ready',
      _job.ref || ' · ' || _job.title || '. Choose collection or delivery.' || CASE WHEN _message IS NOT NULL AND length(trim(_message)) > 0 THEN ' ' || left(trim(_message), 150) ELSE '' END,
      '/projects/' || _job_id);
  END IF;
END;
$$;


ALTER FUNCTION "public"."notify_ready_to_ship"("_job_id" "uuid", "_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_users"("_users" "uuid"[], "_title" "text", "_message" "text", "_link" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  INSERT INTO public.notifications (user_id, title, message, link, read)
  SELECT DISTINCT u, _title, _message, _link, false FROM unnest(_users) AS u
  WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
$$;


ALTER FUNCTION "public"."notify_users"("_users" "uuid"[], "_title" "text", "_message" "text", "_link" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."permission_holders"("_permission" "text") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT m.user_id FROM public.department_members m
  JOIN public.department_permissions dp ON dp.department_id = m.department_id
  WHERE dp.permission = _permission AND NOT public.has_role(m.user_id, 'client'::public.app_role)
  UNION
  SELECT up.user_id FROM public.user_permissions up WHERE up.permission = _permission;
$$;


ALTER FUNCTION "public"."permission_holders"("_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."permission_keys"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT ARRAY['reception', 'planning', 'quality', 'inventory', 'inventory_approve', 'shipping', 'reports', 'billing']::text[];
$$;


ALTER FUNCTION "public"."permission_keys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_manager_role_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'manager'::public.app_role) THEN
    IF NEW.role NOT IN ('staff'::public.app_role, 'client'::public.app_role)
       OR OLD.role NOT IN ('staff'::public.app_role, 'client'::public.app_role) THEN
      RAISE EXCEPTION 'Managers may only manage staff/client roles' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_manager_role_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_user_roles_user_id_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id on user_roles cannot be changed via UPDATE'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_user_roles_user_id_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_financials"("_from" "date" DEFAULT NULL::"date", "_to" "date" DEFAULT NULL::"date") RETURNS TABLE("id" "uuid", "ref" "text", "title" "text", "status" "text", "intake_type" "text", "client_name" "text", "received_at" timestamp with time zone, "finished_at" timestamp with time zone, "due_date" "date", "charged" numeric, "quoted_pending" numeric, "invoiced" numeric, "paid" numeric, "materials_needed_qty" numeric, "materials_needed_value" numeric, "materials_used_cost" numeric, "labour_hours" numeric, "estimated_hours" numeric, "labour_cost" numeric, "shipping_cost" numeric, "overhead" numeric, "total_cost" numeric, "profit" numeric, "margin_pct" numeric, "forecast_cost" numeric, "forecast_profit" numeric, "outcome" "text", "assignees" "text"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH settings AS (
    SELECT COALESCE((SELECT overhead_percent FROM public.workshop_settings WHERE id = 1), 0) AS overhead_pct
  ),
  avg_rate AS (
    SELECT COALESCE(avg(hourly_cost), 0) AS rate FROM public.labour_rates
  ),
  scope AS (
    SELECT j.* FROM public.jobs j
    WHERE public.has_permission(auth.uid(), 'reports')
      AND j.status <> 'cancelled'
      AND (_from IS NULL OR COALESCE(j.received_at, j.created_at)::date >= _from)
      AND (_to IS NULL OR COALESCE(j.received_at, j.created_at)::date <= _to)
  ),
  quotes AS (
    SELECT q.job_id,
           sum(q.subtotal) FILTER (WHERE q.status = 'accepted') AS charged,
           sum(q.subtotal) FILTER (WHERE q.status IN ('sent', 'pending_approval')) AS pending
    FROM public.project_quotes q WHERE q.job_id IN (SELECT id FROM scope) GROUP BY q.job_id
  ),
  invoices AS (
    SELECT i.job_id,
           sum(COALESCE(i.base_total, i.total)) FILTER (WHERE i.status <> 'cancelled') AS invoiced,
           sum(COALESCE(i.base_total, i.total)) FILTER (WHERE i.status = 'paid') AS paid
    FROM public.invoices i WHERE i.job_id IN (SELECT id FROM scope) GROUP BY i.job_id
  ),
  needed AS (
    SELECT r.job_id, sum(l.quantity) AS qty, sum(l.quantity * COALESCE(it.unit_cost, 0)) AS value
    FROM public.stock_requests r
    JOIN public.stock_request_items l ON l.request_id = r.id AND l.status <> 'cancelled'
    LEFT JOIN public.inventory_items it ON it.id = l.item_id
    WHERE r.job_id IN (SELECT id FROM scope) AND r.status <> 'cancelled'
    GROUP BY r.job_id
  ),
  used AS (
    SELECT t.job_id,
           sum(CASE WHEN t.type = 'out' THEN t.quantity WHEN t.type = 'in' THEN -t.quantity ELSE 0 END * COALESCE(it.unit_cost, 0)) AS cost
    FROM public.inventory_transactions t
    JOIN public.inventory_items it ON it.id = t.item_id
    WHERE t.job_id IN (SELECT id FROM scope) AND t.type IN ('in', 'out')
    GROUP BY t.job_id
  ),
  labour AS (
    SELECT e.job_id, sum(e.hours) AS hours, sum(e.hours * COALESCE(r.hourly_cost, 0)) AS cost
    FROM public.time_entries e LEFT JOIN public.labour_rates r ON r.user_id = e.user_id
    WHERE e.job_id IN (SELECT id FROM scope)
    GROUP BY e.job_id
  ),
  task_hours AS (
    SELECT t.job_id, sum(t.estimated_hours) AS est FROM public.job_tasks t WHERE t.job_id IN (SELECT id FROM scope) GROUP BY t.job_id
  ),
  finished AS (
    SELECT e.job_id, min(e.created_at) AS at FROM public.project_events e
    WHERE e.kind = 'status' AND e.data->>'to' IN ('completed', 'shipped') AND e.job_id IN (SELECT id FROM scope)
    GROUP BY e.job_id
  ),
  people AS (
    SELECT x.job_id, array_agg(DISTINCT p.full_name ORDER BY p.full_name) FILTER (WHERE p.full_name IS NOT NULL) AS names
    FROM (
      SELECT job_id, assigned_to AS uid FROM public.job_tasks WHERE job_id IN (SELECT id FROM scope) AND assigned_to IS NOT NULL
      UNION SELECT id, assigned_staff_id FROM scope WHERE assigned_staff_id IS NOT NULL
      UNION SELECT job_id, user_id FROM public.time_entries WHERE job_id IN (SELECT id FROM scope)
    ) x JOIN public.profiles p ON p.id = x.uid
    GROUP BY x.job_id
  ),
  base AS (
    SELECT s.*,
      COALESCE(q.charged, 0) AS charged_v,
      COALESCE(q.pending, 0) AS pending_v,
      COALESCE(inv.invoiced, 0) AS invoiced_v,
      COALESCE(inv.paid, 0) AS paid_v,
      COALESCE(n.qty, 0) AS need_qty,
      round(COALESCE(n.value, 0), 2) AS need_value,
      round(COALESCE(u.cost, 0), 2) AS used_cost,
      COALESCE(l.hours, 0) AS hours_v,
      COALESCE(s.estimated_hours, th.est, 0) AS est_v,
      round(COALESCE(l.cost, 0), 2) AS labour_v,
      COALESCE(sh.shipping_cost, 0) AS ship_v,
      f.at AS finished_v,
      pe.names AS names_v,
      CASE WHEN COALESCE(l.hours, 0) > 0 AND COALESCE(l.cost, 0) > 0 THEN l.cost / l.hours ELSE (SELECT rate FROM avg_rate) END AS eff_rate
    FROM scope s
    LEFT JOIN quotes q ON q.job_id = s.id
    LEFT JOIN invoices inv ON inv.job_id = s.id
    LEFT JOIN needed n ON n.job_id = s.id
    LEFT JOIN used u ON u.job_id = s.id
    LEFT JOIN labour l ON l.job_id = s.id
    LEFT JOIN task_hours th ON th.job_id = s.id
    LEFT JOIN public.shipments sh ON sh.job_id = s.id
    LEFT JOIN finished f ON f.job_id = s.id
    LEFT JOIN people pe ON pe.job_id = s.id
  ),
  costed AS (
    SELECT b.*,
      round((b.used_cost + b.labour_v + b.ship_v) * (SELECT overhead_pct FROM settings) / 100, 2) AS overhead_v,
      round((GREATEST(b.used_cost, b.need_value) + GREATEST(b.hours_v, b.est_v) * b.eff_rate + b.ship_v)
            * (1 + (SELECT overhead_pct FROM settings) / 100), 2) AS forecast_v
    FROM base b
  )
  SELECT
    c.id, c.ref, c.title, c.status, c.intake_type,
    COALESCE(NULLIF(cp.company_name, ''), cp.full_name, c.contact_name) AS client_name,
    COALESCE(c.received_at, c.created_at), c.finished_v, c.due_date,
    c.charged_v, c.pending_v, c.invoiced_v, c.paid_v,
    c.need_qty, c.need_value, c.used_cost,
    c.hours_v, c.est_v, c.labour_v, c.ship_v,
    c.overhead_v,
    round(c.used_cost + c.labour_v + c.ship_v + c.overhead_v, 2),
    round(c.charged_v - (c.used_cost + c.labour_v + c.ship_v + c.overhead_v), 2),
    CASE WHEN c.charged_v > 0 THEN round((c.charged_v - (c.used_cost + c.labour_v + c.ship_v + c.overhead_v)) / c.charged_v * 100, 1) END,
    c.forecast_v,
    round(c.charged_v - c.forecast_v, 2),
    CASE
      WHEN c.charged_v = 0 THEN 'not_priced'
      WHEN c.status IN ('completed', 'shipped') THEN
        CASE WHEN c.charged_v - (c.used_cost + c.labour_v + c.ship_v + c.overhead_v) >= 0 THEN 'profit' ELSE 'loss' END
      ELSE CASE WHEN c.charged_v - c.forecast_v >= 0 THEN 'on_track' ELSE 'at_risk' END
    END,
    COALESCE(c.names_v, '{}')
  FROM costed c
  LEFT JOIN public.profiles cp ON cp.id = c.client_id
  ORDER BY COALESCE(c.received_at, c.created_at) DESC;
$$;


ALTER FUNCTION "public"."project_financials"("_from" "date", "_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_quote_items_total"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _quote uuid := COALESCE(NEW.quote_id, OLD.quote_id);
BEGIN
  UPDATE public.project_quotes
    SET subtotal = (SELECT COALESCE(round(sum(quantity * unit_price), 2), 0) FROM public.project_quote_items WHERE quote_id = _quote)
    WHERE id = _quote;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."project_quote_items_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_quote_label"("_job_id" "uuid", "_kind" "text", "_number" integer) RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT j.ref || '-' || CASE WHEN _kind = 'quote' THEN 'Q' ELSE 'CR' END || _number
  FROM public.jobs j WHERE j.id = _job_id;
$$;


ALTER FUNCTION "public"."project_quote_label"("_job_id" "uuid", "_kind" "text", "_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_quotes_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('project_quotes:' || NEW.job_id::text || NEW.kind));
    SELECT COALESCE(max(number), 0) + 1 INTO NEW.number FROM public.project_quotes WHERE job_id = NEW.job_id AND kind = NEW.kind;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."project_quotes_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_order_items_total"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _po uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE public.purchase_orders
    SET subtotal = (SELECT COALESCE(round(sum(quantity * unit_cost), 2), 0) FROM public.purchase_order_items WHERE po_id = _po)
    WHERE id = _po;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."purchase_order_items_total"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_orders_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _period text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMM');
  _n integer;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    INSERT INTO public.project_ref_counters AS c (period, last_value) VALUES ('P' || _period, 1)
    ON CONFLICT (period) DO UPDATE SET last_value = c.last_value + 1
    RETURNING last_value INTO _n;
    NEW.po_number := 'PO-' || _period || '-' || CASE WHEN _n < 1000 THEN lpad(_n::text, 3, '0') ELSE _n::text END;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."purchase_orders_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quality_check"("_job_id" "uuid", "_pass" boolean, "_note" "text" DEFAULT NULL::"text", "_rework_task_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _job public.jobs%ROWTYPE;
  _t public.job_tasks%ROWTYPE;
  _order integer;
BEGIN
  IF NOT public.has_permission(_uid, 'quality') THEN RAISE EXCEPTION 'You can''t sign off quality' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF _job.status <> 'review' THEN RAISE EXCEPTION 'This project isn''t waiting for a quality check' USING ERRCODE = '22023'; END IF;

  IF _pass THEN
    UPDATE public.jobs SET status = 'completed' WHERE id = _job_id;
    PERFORM public.add_project_event(_job_id, 'qc_passed', jsonb_build_object('note', _note));
    IF _note IS NOT NULL AND length(trim(_note)) > 0 THEN
      INSERT INTO public.job_comments (job_id, user_id, body, is_internal) VALUES (_job_id, _uid, left('Quality check passed: ' || trim(_note), 2000), true);
    END IF;
    PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('shipping')),
      'Ready to ship: ' || _job.ref, _job.title, '/projects/' || _job_id);
    RETURN 'completed';
  END IF;

  IF _rework_task_ids IS NULL OR array_length(_rework_task_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Choose the tasks that need rework' USING ERRCODE = '22023';
  END IF;
  IF _note IS NULL OR length(trim(_note)) = 0 THEN RAISE EXCEPTION 'Say what needs fixing' USING ERRCODE = '22023'; END IF;

  SELECT COALESCE(max(order_index), 0) INTO _order FROM public.job_tasks WHERE job_id = _job_id;
  FOR _t IN SELECT * FROM public.job_tasks WHERE job_id = _job_id AND id = ANY (_rework_task_ids) LOOP
    _order := _order + 1;
    INSERT INTO public.job_tasks (job_id, title, description, status, department_id, assigned_to, rework_of, order_index)
    VALUES (_job_id, left('Rework: ' || _t.title, 200), trim(_note), 'pending', _t.department_id, _t.assigned_to, _t.id, _order);
    PERFORM public.add_project_event(_job_id, 'task_returned', jsonb_build_object('task', _t.title, 'reason', trim(_note)));
    PERFORM public.notify_users(
      CASE WHEN _t.assigned_to IS NOT NULL THEN ARRAY[_t.assigned_to]
           ELSE ARRAY(SELECT user_id FROM public.department_members WHERE department_id = _t.department_id) END,
      'Rework needed: ' || _t.title, _job.ref || ' · ' || left(trim(_note), 120), '/projects/' || _job_id);
  END LOOP;
  INSERT INTO public.job_comments (job_id, user_id, body, is_internal) VALUES (_job_id, _uid, left('Sent back from quality check: ' || trim(_note), 2000), true);
  UPDATE public.jobs SET status = 'in_progress' WHERE id = _job_id;
  RETURN 'in_progress';
END;
$$;


ALTER FUNCTION "public"."quality_check"("_job_id" "uuid", "_pass" boolean, "_note" "text", "_rework_task_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_purchase_order"("_po_id" "uuid", "_lines" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _po public.purchase_orders%ROWTYPE;
  _l jsonb;
  _line public.purchase_order_items%ROWTYPE;
  _qty numeric;
  _item uuid;
  _stock public.inventory_items%ROWTYPE;
  _notify uuid[] := '{}';
BEGIN
  IF NOT public.is_storekeeper(_uid) THEN RAISE EXCEPTION 'Only stores can receive goods' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = 'P0002'; END IF;
  IF _po.status NOT IN ('approved', 'ordered') THEN RAISE EXCEPTION 'Only an approved or ordered purchase can be received' USING ERRCODE = '22023'; END IF;

  FOR _l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    _qty := COALESCE((_l->>'quantity')::numeric, 0);
    CONTINUE WHEN _qty <= 0;
    SELECT * INTO _line FROM public.purchase_order_items WHERE id = (_l->>'line_id')::uuid AND po_id = _po_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    _item := _line.item_id;
    IF _item IS NULL THEN
      INSERT INTO public.inventory_items (name, unit, unit_cost, quantity, min_stock, supplier_id)
      VALUES (left(_line.description, 200), 'pcs', _line.unit_cost, 0, 0, _po.supplier_id)
      RETURNING id INTO _item;
      UPDATE public.purchase_order_items SET item_id = _item WHERE id = _line.id;
      IF _line.request_item_id IS NOT NULL THEN
        UPDATE public.stock_request_items SET item_id = _item WHERE id = _line.request_item_id AND item_id IS NULL;
      END IF;
    END IF;
    SELECT * INTO _stock FROM public.inventory_items WHERE id = _item FOR UPDATE;
    UPDATE public.inventory_items
      SET unit_cost = CASE WHEN _stock.quantity + _qty > 0
                           THEN round((GREATEST(_stock.quantity, 0) * _stock.unit_cost + _qty * _line.unit_cost) / (GREATEST(_stock.quantity, 0) + _qty), 4)
                           ELSE _line.unit_cost END,
          quantity = quantity + _qty
      WHERE id = _item;
    INSERT INTO public.inventory_transactions (item_id, user_id, type, quantity, notes)
    VALUES (_item, _uid, 'in', _qty, 'Received on ' || _po.po_number);
    UPDATE public.purchase_order_items SET quantity_received = quantity_received + _qty WHERE id = _line.id;
    IF _line.request_item_id IS NOT NULL THEN
      UPDATE public.stock_request_items SET status = 'open' WHERE id = _line.request_item_id AND status = 'ordering';
      _notify := _notify || ARRAY(SELECT r.requested_by FROM public.stock_requests r JOIN public.stock_request_items i ON i.request_id = r.id WHERE i.id = _line.request_item_id);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE po_id = _po_id AND quantity_received < quantity) THEN
    UPDATE public.purchase_orders SET status = 'received', received_at = now() WHERE id = _po_id;
  ELSE
    UPDATE public.purchase_orders SET status = 'ordered', ordered_at = COALESCE(ordered_at, now()) WHERE id = _po_id;
  END IF;
  IF array_length(_notify, 1) > 0 THEN
    PERFORM public.notify_users(_notify, 'Ordered parts have arrived', _po.po_number || ': stores will issue them to your project.', '/inventory');
  END IF;
  RETURN (SELECT status FROM public.purchase_orders WHERE id = _po_id);
END;
$$;


ALTER FUNCTION "public"."receive_purchase_order"("_po_id" "uuid", "_lines" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reception_clients"() RETURNS TABLE("id" "uuid", "full_name" "text", "company_name" "text", "phone" "text", "email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.company_name, p.phone, u.email::text
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'client'
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_permission(auth.uid(), 'reception') AND p.is_active
  ORDER BY COALESCE(NULLIF(p.company_name, ''), p.full_name);
$$;


ALTER FUNCTION "public"."reception_clients"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_signup_code"("_code" "text") RETURNS TABLE("valid" boolean, "role" "public"."app_role")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _row public.signup_codes%ROWTYPE;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN QUERY SELECT false, 'client'::app_role;
    RETURN;
  END IF;

  SELECT * INTO _row FROM public.signup_codes
    WHERE lower(code) = lower(trim(_code))
      AND active = TRUE
      AND (expires_at IS NULL OR expires_at > now())
      AND (max_uses IS NULL OR uses_count < max_uses)
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'client'::app_role;
    RETURN;
  END IF;

  UPDATE public.signup_codes SET uses_count = uses_count + 1 WHERE id = _row.id;
  RETURN QUERY SELECT true, _row.role;
END;
$$;


ALTER FUNCTION "public"."redeem_signup_code"("_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_stock_request"("_request_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.stock_requests r SET status = CASE
    WHEN r.status = 'cancelled' THEN 'cancelled'
    WHEN NOT EXISTS (SELECT 1 FROM public.stock_request_items i WHERE i.request_id = r.id AND i.status NOT IN ('issued', 'cancelled')) THEN 'fulfilled'
    WHEN EXISTS (SELECT 1 FROM public.stock_request_items i WHERE i.request_id = r.id AND i.quantity_issued > 0) THEN 'partial'
    ELSE 'open' END
  WHERE r.id = _request_id;
$$;


ALTER FUNCTION "public"."refresh_stock_request"("_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_parts"("_job_id" "uuid", "_items" "jsonb", "_notes" "text" DEFAULT NULL::"text", "_needed_by" "date" DEFAULT NULL::"date", "_task_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _item jsonb;
  _job public.jobs%ROWTYPE;
  _summary text;
BEGIN
  IF _uid IS NULL OR public.has_role(_uid, 'client'::public.app_role) OR NOT public.can_view_job(_uid, _job_id) THEN
    RAISE EXCEPTION 'You can''t request parts for this project' USING ERRCODE = '42501';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Add at least one part' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;

  INSERT INTO public.stock_requests (job_id, task_id, requested_by, needed_by, notes)
  VALUES (_job_id, _task_id, _uid, _needed_by, NULLIF(trim(COALESCE(_notes, '')), ''))
  RETURNING id INTO _id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.stock_request_items (request_id, item_id, description, quantity)
    VALUES (
      _id,
      NULLIF(_item->>'item_id', '')::uuid,
      COALESCE(NULLIF(trim(_item->>'description'), ''), (SELECT name FROM public.inventory_items WHERE id = NULLIF(_item->>'item_id', '')::uuid), 'Part'),
      COALESCE((_item->>'quantity')::numeric, 1)
    );
  END LOOP;

  SELECT string_agg(description || ' × ' || trim(to_char(quantity, 'FM999999990.##')), ', ') INTO _summary FROM public.stock_request_items WHERE request_id = _id;
  PERFORM public.add_project_event(_job_id, 'parts_requested', jsonb_build_object('summary', left(_summary, 200)));
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('inventory')),
    'Parts requested for ' || _job.ref, left(_summary, 160), '/inventory');
  RETURN _id;
END;
$$;


ALTER FUNCTION "public"."request_parts"("_job_id" "uuid", "_items" "jsonb", "_notes" "text", "_needed_by" "date", "_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_workshop_data"("_full" boolean, "_keep_user" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."reset_workshop_data"("_full" boolean, "_keep_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_workshop_data"("_data" "jsonb", "_caller" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."restore_workshop_data"("_data" "jsonb", "_caller" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."return_parts"("_job_id" "uuid", "_item_id" "uuid", "_quantity" numeric, "_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _out numeric;
  _ref text;
BEGIN
  IF NOT public.is_storekeeper(auth.uid()) THEN RAISE EXCEPTION 'Only stores can take parts back' USING ERRCODE = '42501'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Enter how many came back' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(CASE WHEN type = 'out' THEN quantity WHEN type = 'in' THEN -quantity ELSE 0 END), 0) INTO _out
    FROM public.inventory_transactions WHERE job_id = _job_id AND item_id = _item_id;
  IF _quantity > _out THEN RAISE EXCEPTION 'Only % were issued to this project', trim(to_char(_out, 'FM999999990.##')) USING ERRCODE = '22023'; END IF;
  SELECT ref INTO _ref FROM public.jobs WHERE id = _job_id;
  UPDATE public.inventory_items SET quantity = quantity + _quantity WHERE id = _item_id;
  INSERT INTO public.inventory_transactions (item_id, job_id, user_id, type, quantity, notes)
  VALUES (_item_id, _job_id, auth.uid(), 'in', _quantity, COALESCE(NULLIF(trim(COALESCE(_note, '')), ''), 'Returned from ' || _ref));
END;
$$;


ALTER FUNCTION "public"."return_parts"("_job_id" "uuid", "_item_id" "uuid", "_quantity" numeric, "_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_change_request"("_quote_id" "uuid", "_approve" boolean, "_note" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _q public.project_quotes%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _label text;
BEGIN
  IF NOT public.has_role(_uid, 'admin'::public.app_role) THEN RAISE EXCEPTION 'Only an admin can sign off change requests' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND OR _q.kind <> 'change' THEN RAISE EXCEPTION 'Change request not found' USING ERRCODE = 'P0002'; END IF;
  IF _q.status <> 'pending_approval' THEN RAISE EXCEPTION 'This change request isn''t waiting for sign-off' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _q.job_id;
  _label := public.project_quote_label(_q.job_id, _q.kind, _q.number);

  IF _approve THEN
    UPDATE public.project_quotes SET status = 'sent', approved_by = _uid, approved_at = now(), sent_at = now() WHERE id = _quote_id;
    PERFORM public.add_project_event(_q.job_id, 'quote_sent', jsonb_build_object('label', 'Change request ' || _label, 'total', _q.subtotal::text), true);
    IF _job.client_id IS NOT NULL THEN
      PERFORM public.notify_users(ARRAY[_job.client_id], 'A change to your project needs your approval', _label || ' · ' || _job.title, '/projects/' || _q.job_id);
    END IF;
    PERFORM public.notify_users(ARRAY[_q.created_by], 'Change request signed off: ' || _label, 'It has been sent to the client.', '/projects/' || _q.job_id);
    RETURN 'sent';
  END IF;

  UPDATE public.project_quotes SET status = 'withdrawn', decided_at = now(), decided_by = _uid, decision_note = NULLIF(trim(COALESCE(_note, '')), '') WHERE id = _quote_id;
  PERFORM public.add_project_event(_q.job_id, 'change_request', jsonb_build_object('label', _label, 'action', 'not approved', 'reason', _note));
  PERFORM public.notify_users(ARRAY[_q.created_by], 'Change request not approved: ' || _label, COALESCE(_note, 'No reason given.'), '/projects/' || _q.job_id);
  RETURN 'withdrawn';
END;
$$;


ALTER FUNCTION "public"."review_change_request"("_quote_id" "uuid", "_approve" boolean, "_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_project_quote"("_quote_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _q public.project_quotes%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _label text;
  _is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
BEGIN
  IF NOT public.can_quote(_uid) THEN RAISE EXCEPTION 'You can''t send quotes' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002'; END IF;
  IF _q.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be sent' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_quote_items WHERE quote_id = _quote_id) THEN
    RAISE EXCEPTION 'Add at least one line before sending' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _q.job_id FOR UPDATE;
  _label := public.project_quote_label(_q.job_id, _q.kind, _q.number);

  IF _q.kind = 'change' AND NOT _is_admin THEN
    UPDATE public.project_quotes SET status = 'pending_approval' WHERE id = _quote_id;
    PERFORM public.add_project_event(_q.job_id, 'change_request', jsonb_build_object('label', _label, 'action', 'sent for approval'));
    PERFORM public.notify_users(ARRAY(SELECT user_id FROM public.user_roles WHERE role = 'admin'),
      'Change request to approve: ' || _label, COALESCE(NULLIF(_q.title, ''), _job.title), '/projects/' || _q.job_id);
    RETURN 'pending_approval';
  END IF;

  UPDATE public.project_quotes
    SET status = 'sent', sent_at = now(),
        approved_by = CASE WHEN _q.kind = 'change' THEN _uid ELSE approved_by END,
        approved_at = CASE WHEN _q.kind = 'change' THEN now() ELSE approved_at END
    WHERE id = _quote_id;
  IF _q.kind = 'quote' AND _job.status IN ('received', 'evaluation') THEN
    UPDATE public.jobs SET status = 'quote' WHERE id = _q.job_id;
  END IF;
  PERFORM public.add_project_event(_q.job_id, 'quote_sent',
    jsonb_build_object('label', CASE WHEN _q.kind = 'quote' THEN 'Quote ' ELSE 'Change request ' END || _label, 'total', _q.subtotal::text), true);
  IF _job.client_id IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_job.client_id],
      CASE WHEN _q.kind = 'quote' THEN 'Your quote is ready' ELSE 'A change to your project needs your approval' END,
      _label || ' · ' || _job.title, '/projects/' || _q.job_id);
  END IF;
  RETURN 'sent';
END;
$$;


ALTER FUNCTION "public"."send_project_quote"("_quote_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."feature_flags" (
    "key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "feature_flags_key_check" CHECK (("key" = ANY (ARRAY['appointments'::"text", 'client_portal'::"text", 'goals'::"text", 'reports'::"text", 'job_chat'::"text", 'generate_sample_data'::"text", 'setup_demo_users'::"text", 'backup_restore'::"text"])))
);


ALTER TABLE "public"."feature_flags" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_feature_flag"("feature_key" "text", "feature_enabled" boolean) RETURNS "public"."feature_flags"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    'generate_sample_data','setup_demo_users'
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


ALTER FUNCTION "public"."set_feature_flag"("feature_key" "text", "feature_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."signup_codes_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."signup_codes_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_purchase_order"("_po_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _po public.purchase_orders%ROWTYPE;
  _limit numeric;
  _approvers uuid[];
BEGIN
  IF NOT public.is_storekeeper(auth.uid()) THEN RAISE EXCEPTION 'Only stores can submit purchase orders' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = 'P0002'; END IF;
  IF _po.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE po_id = _po_id) THEN RAISE EXCEPTION 'Add at least one line' USING ERRCODE = '22023'; END IF;
  UPDATE public.purchase_orders SET status = 'pending_approval' WHERE id = _po_id;

  SELECT COALESCE(purchase_manager_limit, 0) INTO _limit FROM public.workshop_settings WHERE id = 1;
  _approvers := ARRAY(SELECT user_id FROM public.user_roles WHERE role = 'admin');
  IF _po.subtotal <= _limit THEN
    _approvers := _approvers || ARRAY(SELECT user_id FROM public.user_roles WHERE role = 'manager') || ARRAY(SELECT public.permission_holders('inventory_approve'));
  END IF;
  PERFORM public.notify_users(_approvers, 'Purchase to approve: ' || _po.po_number,
    trim(to_char(_po.subtotal, 'FM999999990.00')) || ' ' || COALESCE(_po.currency, ''), '/inventory/purchases');
  RETURN 'pending_approval';
END;
$$;


ALTER FUNCTION "public"."submit_purchase_order"("_po_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_quote"("_request_id" "uuid", "_currency" "text", "_notes" "text", "_expires_at" timestamp with time zone, "_items" "jsonb") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _total numeric := 0;
  _item jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Admin or manager access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _req FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _req.request_type <> 'quote' THEN
    RAISE EXCEPTION 'Only quote requests accept a quote' USING ERRCODE = '22023';
  END IF;
  IF _req.status NOT IN ('pending','quoted') THEN
    RAISE EXCEPTION 'Quote can only be sent while pending or quoted' USING ERRCODE = '22023';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.request_quote_items WHERE request_id = _request_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.request_quote_items (request_id, description, quantity, unit_price)
    VALUES (
      _request_id,
      COALESCE(_item->>'description',''),
      COALESCE((_item->>'quantity')::numeric, 1),
      COALESCE((_item->>'unit_price')::numeric, 0)
    );
    _total := _total + COALESCE((_item->>'quantity')::numeric, 1) * COALESCE((_item->>'unit_price')::numeric, 0);
  END LOOP;

  UPDATE public.client_requests
    SET status = 'quoted',
        quoted_total = _total,
        quoted_currency = COALESCE(_currency, quoted_currency),
        quoted_notes = _notes,
        quote_expires_at = _expires_at,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        client_decision_at = NULL,
        decline_reason = NULL
    WHERE id = _request_id;

  RETURN _total;
END;
$$;


ALTER FUNCTION "public"."submit_quote"("_request_id" "uuid", "_currency" "text", "_notes" "text", "_expires_at" timestamp with time zone, "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."team_performance"("_from" timestamp with time zone, "_to" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "full_name" "text", "role" "text", "hours" numeric, "handoffs" bigint, "task_value" numeric, "projects" bigint, "labour_cost" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH people AS (
    SELECT r.user_id, r.role::text AS role, p.full_name
    FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.role IN ('staff', 'manager') AND p.is_active AND NOT COALESCE(p.is_super_admin, false)
  ),
  hrs AS (
    SELECT e.user_id, sum(e.hours) AS hours, count(DISTINCT e.job_id) AS projects
    FROM public.time_entries e WHERE e.work_date >= _from::date AND e.work_date <= _to::date GROUP BY e.user_id
  ),
  hand AS (
    SELECT h.from_user AS user_id, count(*) AS n FROM public.task_handoffs h WHERE h.created_at >= _from AND h.created_at <= _to GROUP BY h.from_user
  ),
  val AS (
    SELECT COALESCE(t.completed_by, t.assigned_to) AS user_id, sum(COALESCE(t.value, 0)) AS v
    FROM public.job_tasks t
    WHERE t.status = 'completed' AND COALESCE(t.completed_at, t.updated_at) >= _from AND COALESCE(t.completed_at, t.updated_at) <= _to
    GROUP BY 1
  )
  SELECT p.user_id, p.full_name, p.role,
         COALESCE(h.hours, 0), COALESCE(hd.n, 0), COALESCE(v.v, 0), COALESCE(h.projects, 0),
         CASE WHEN public.has_permission(auth.uid(), 'reports') THEN round(COALESCE(h.hours, 0) * COALESCE(lr.hourly_cost, 0), 2) END
  FROM people p
  LEFT JOIN hrs h ON h.user_id = p.user_id
  LEFT JOIN hand hd ON hd.user_id = p.user_id
  LEFT JOIN val v ON v.user_id = p.user_id
  LEFT JOIN public.labour_rates lr ON lr.user_id = p.user_id
  WHERE auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'client'::public.app_role)
  ORDER BY COALESCE(v.v, 0) DESC, COALESCE(h.hours, 0) DESC;
$$;


ALTER FUNCTION "public"."team_performance"("_from" timestamp with time zone, "_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."time_entries_sync_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _job uuid := COALESCE(NEW.job_id, OLD.job_id);
BEGIN
  UPDATE public.jobs
    SET actual_hours = (SELECT NULLIF(round(COALESCE(sum(hours), 0), 2), 0) FROM public.time_entries WHERE job_id = _job)
    WHERE id = _job;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."time_entries_sync_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_profile_login"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
    SET last_sign_in_at    = now(),
        invite_accepted_at = COALESCE(invite_accepted_at, now())
    WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."touch_profile_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."withdraw_project_quote"("_quote_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _q public.project_quotes%ROWTYPE;
BEGIN
  IF NOT public.can_quote(auth.uid()) THEN RAISE EXCEPTION 'You can''t withdraw quotes' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002'; END IF;
  IF _q.status NOT IN ('pending_approval', 'sent') THEN RAISE EXCEPTION 'Only a quote waiting on someone can be withdrawn' USING ERRCODE = '22023'; END IF;
  UPDATE public.project_quotes SET status = 'withdrawn' WHERE id = _quote_id;
  PERFORM public.add_project_event(_q.job_id, 'change_request', jsonb_build_object('label', public.project_quote_label(_q.job_id, _q.kind, _q.number), 'action', 'withdrawn'));
END;
$$;


ALTER FUNCTION "public"."withdraw_project_quote"("_quote_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workshop_data_tables"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."workshop_data_tables"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workshop_setup_tables"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT ARRAY[
    'workshop_settings', 'feature_flags', 'signup_codes', 'broadcasts', 'system_notices',
    'departments', 'department_members', 'department_permissions', 'user_permissions',
    'labour_rates', 'monthly_revenue_goals', 'saved_reports'
  ]::text[]
$$;


ALTER FUNCTION "public"."workshop_setup_tables"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "text",
    "summary" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_onboarding_progress" (
    "user_id" "uuid" NOT NULL,
    "skipped_steps" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "dismissed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_onboarding_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "appointment_date" "date" NOT NULL,
    "appointment_time" time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 60 NOT NULL,
    "type" "text" DEFAULT 'consultation'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "appointments_type_check" CHECK (("type" = ANY (ARRAY['consultation'::"text", 'repair'::"text", 'inspection'::"text", 'pickup'::"text", 'delivery'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "severity" "public"."broadcast_severity" DEFAULT 'info'::"public"."broadcast_severity" NOT NULL,
    "link_url" "text",
    "link_label" "text",
    "active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."broadcasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bug_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "page_url" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bug_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "request_type" "public"."client_request_type" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "preferred_date" "date",
    "status" "public"."client_request_status" DEFAULT 'pending'::"public"."client_request_status" NOT NULL,
    "decline_reason" "text",
    "converted_job_id" "uuid",
    "quoted_invoice_id" "uuid",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "quoted_total" numeric,
    "quoted_currency" "text",
    "quoted_notes" "text",
    "quote_expires_at" timestamp with time zone,
    "client_decision_at" timestamp with time zone,
    CONSTRAINT "client_requests_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"])))
);


ALTER TABLE "public"."client_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_prefs" (
    "user_id" "uuid" NOT NULL,
    "card_order" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "hidden" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dashboard_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."department_members" (
    "department_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_lead" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."department_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."department_permissions" (
    "department_id" "uuid" NOT NULL,
    "permission" "text" NOT NULL,
    CONSTRAINT "department_permissions_permission_check" CHECK (("permission" = ANY ("public"."permission_keys"())))
);


ALTER TABLE "public"."department_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "departments_description_check" CHECK ((("description" IS NULL) OR ("length"("description") <= 300))),
    CONSTRAINT "departments_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 2) AND ("length"(TRIM(BOTH FROM "name")) <= 60)))
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dismissed_broadcasts" (
    "user_id" "uuid" NOT NULL,
    "broadcast_id" "uuid" NOT NULL,
    "dismissed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dismissed_broadcasts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dismissed_notices" (
    "user_id" "uuid" NOT NULL,
    "notice_id" "uuid" NOT NULL,
    "dismissed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dismissed_notices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text",
    "category" "text",
    "description" "text",
    "quantity" integer DEFAULT 0 NOT NULL,
    "min_stock" integer DEFAULT 0 NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "supplier_id" "uuid",
    "location" "text",
    "reorder_quantity" numeric,
    CONSTRAINT "inventory_items_reorder_quantity_check" CHECK ((("reorder_quantity" IS NULL) OR ("reorder_quantity" >= (0)::numeric)))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_transactions_type_check" CHECK (("type" = ANY (ARRAY['in'::"text", 'out'::"text", 'adjustment'::"text"])))
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_pdf_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "status_at_generation" "text",
    "file_path" "text" NOT NULL,
    "file_size" integer,
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_pdf_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "tax_rate" numeric DEFAULT 0 NOT NULL,
    "tax_amount" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_payment_url" "text",
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "fx_rate" numeric DEFAULT 1 NOT NULL,
    "base_total" numeric GENERATED ALWAYS AS (("total" * "fx_rate")) STORED,
    "payment_instructions" "text",
    "client_marked_paid_at" timestamp with time zone,
    "discount_type" "text",
    "discount_value" numeric DEFAULT 0 NOT NULL,
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "discount_reason" "text",
    CONSTRAINT "invoices_discount_check" CHECK (((("discount_type" IS NULL) AND ("discount_value" = (0)::numeric) AND ("discount_amount" = (0)::numeric)) OR (("discount_type" = 'percent'::"text") AND ("discount_value" > (0)::numeric) AND ("discount_value" <= (100)::numeric) AND ("discount_amount" >= (0)::numeric)) OR (("discount_type" = 'amount'::"text") AND ("discount_value" > (0)::numeric) AND ("discount_amount" >= (0)::numeric) AND ("discount_amount" <= "subtotal")))),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'paid'::"text", 'overdue'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "uploaded_by" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_type" "text" DEFAULT ''::"text" NOT NULL,
    "file_size" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'work'::"text" NOT NULL,
    CONSTRAINT "job_attachments_kind_check" CHECK (("kind" = ANY (ARRAY['intake'::"text", 'work'::"text", 'shared'::"text", 'handoff'::"text", 'delivery'::"text", 'client'::"text"])))
);


ALTER TABLE "public"."job_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_comments" (
    "id" bigint NOT NULL,
    "job_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "is_internal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'comment'::"text" NOT NULL,
    "legacy_update_id" "uuid",
    CONSTRAINT "job_comments_body_check" CHECK ((("length"(TRIM(BOTH FROM "body")) > 0) AND ("length"("body") <= 2000))),
    CONSTRAINT "job_comments_source_check" CHECK (("source" = ANY (ARRAY['comment'::"text", 'update'::"text"])))
);


ALTER TABLE "public"."job_comments" OWNER TO "postgres";


ALTER TABLE "public"."job_comments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."job_comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."job_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "job_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."job_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_task_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_task_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "assigned_to" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "due_date" "date",
    "order_index" integer DEFAULT 0,
    "value" numeric(10,2) DEFAULT 0,
    "department_id" "uuid",
    "estimated_hours" numeric,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "rework_of" "uuid",
    CONSTRAINT "job_tasks_estimated_hours_check" CHECK ((("estimated_hours" IS NULL) OR ("estimated_hours" >= (0)::numeric))),
    CONSTRAINT "job_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."job_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "assigned_staff_id" "uuid",
    "client_id" "uuid",
    "estimated_hours" numeric,
    "actual_hours" numeric,
    "due_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_request_id" "uuid",
    "ref" "text" DEFAULT ''::"text" NOT NULL,
    "intake_type" "text" DEFAULT 'approved'::"text" NOT NULL,
    "make_model" "text",
    "serial_number" "text",
    "accessories" "text",
    "condition_notes" "text",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "received_by" "uuid",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    CONSTRAINT "jobs_intake_type_check" CHECK (("intake_type" = ANY (ARRAY['evaluation'::"text", 'quote'::"text", 'approved'::"text"]))),
    CONSTRAINT "jobs_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "jobs_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'evaluation'::"text", 'quote'::"text", 'pending'::"text", 'in_progress'::"text", 'review'::"text", 'completed'::"text", 'shipped'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labour_rates" (
    "user_id" "uuid" NOT NULL,
    "hourly_cost" numeric NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "labour_rates_hourly_cost_check" CHECK ((("hourly_cost" >= (0)::numeric) AND ("hourly_cost" < (100000)::numeric)))
);


ALTER TABLE "public"."labour_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mfa_backup_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_backup_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mfa_rate_limits" (
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mfa_trusted_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "device_label" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_trusted_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_revenue_goals" (
    "id" bigint NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "goal_amount" numeric(10,2) NOT NULL,
    "set_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "monthly_revenue_goals_month_check" CHECK ((("month" >= 1) AND ("month" <= 12)))
);


ALTER TABLE "public"."monthly_revenue_goals" OWNER TO "postgres";


ALTER TABLE "public"."monthly_revenue_goals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."monthly_revenue_goals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "read" boolean DEFAULT false NOT NULL,
    "link" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "company_name" "text",
    "contact_person" "text",
    "address" "text",
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "last_sign_in_at" timestamp with time zone,
    "invited_at" timestamp with time zone,
    "invite_accepted_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_events" (
    "id" bigint NOT NULL,
    "job_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "actor_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "client_visible" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_events" OWNER TO "postgres";


ALTER TABLE "public"."project_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_quote_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "project_quote_items_description_check" CHECK ((("length"(TRIM(BOTH FROM "description")) >= 1) AND ("length"(TRIM(BOTH FROM "description")) <= 500))),
    CONSTRAINT "project_quote_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "project_quote_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."project_quote_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "number" integer DEFAULT 0 NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "reason" "text",
    "notes" "text",
    "currency" "text",
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "schedule_impact_days" integer,
    "valid_until" "date",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    "decision_note" "text",
    CONSTRAINT "project_quotes_decision_note_check" CHECK ((("decision_note" IS NULL) OR ("length"("decision_note") <= 1000))),
    CONSTRAINT "project_quotes_kind_check" CHECK (("kind" = ANY (ARRAY['quote'::"text", 'change'::"text"]))),
    CONSTRAINT "project_quotes_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 2000))),
    CONSTRAINT "project_quotes_reason_check" CHECK ((("reason" IS NULL) OR ("length"("reason") <= 2000))),
    CONSTRAINT "project_quotes_schedule_impact_days_check" CHECK ((("schedule_impact_days" IS NULL) OR (("schedule_impact_days" >= '-365'::integer) AND ("schedule_impact_days" <= 365)))),
    CONSTRAINT "project_quotes_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'sent'::"text", 'accepted'::"text", 'declined'::"text", 'withdrawn'::"text"]))),
    CONSTRAINT "project_quotes_title_check" CHECK (("length"("title") <= 200))
);


ALTER TABLE "public"."project_quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_ref_counters" (
    "period" "text" NOT NULL,
    "last_value" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "project_ref_counters_period_check" CHECK (("period" ~ '^P?[0-9]{6}$'::"text"))
);


ALTER TABLE "public"."project_ref_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "request_item_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit_cost" numeric DEFAULT 0 NOT NULL,
    "quantity_received" numeric DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "purchase_order_items_description_check" CHECK ((("length"(TRIM(BOTH FROM "description")) >= 1) AND ("length"(TRIM(BOTH FROM "description")) <= 300))),
    CONSTRAINT "purchase_order_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "purchase_order_items_quantity_received_check" CHECK (("quantity_received" >= (0)::numeric)),
    CONSTRAINT "purchase_order_items_unit_cost_check" CHECK (("unit_cost" >= (0)::numeric))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_number" "text" DEFAULT ''::"text" NOT NULL,
    "supplier_id" "uuid",
    "job_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "currency" "text",
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "quote_file_path" "text",
    "quote_file_name" "text",
    "notes" "text",
    "expected_at" "date",
    "created_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "decision_note" "text",
    "ordered_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_orders_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 2000))),
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'approved'::"text", 'rejected'::"text", 'ordered'::"text", 'received'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_quote_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."request_quote_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saved_reports_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 80)))
);


ALTER TABLE "public"."saved_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "method" "text",
    "preferred_date" "date",
    "delivery_address" "text",
    "client_notes" "text",
    "notified_at" timestamp with time zone,
    "choice_made_at" timestamp with time zone,
    "collector_name" "text",
    "collector_id_number" "text",
    "collector_phone" "text",
    "vehicle_make" "text",
    "vehicle_registration" "text",
    "carrier" "text",
    "tracking_number" "text",
    "tracking_url" "text",
    "shipping_cost" numeric,
    "currency" "text",
    "shipped_at" timestamp with time zone,
    "shipped_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shipments_client_notes_check" CHECK ((("client_notes" IS NULL) OR ("length"("client_notes") <= 1000))),
    CONSTRAINT "shipments_delivery_address_check" CHECK ((("delivery_address" IS NULL) OR ("length"("delivery_address") <= 500))),
    CONSTRAINT "shipments_method_check" CHECK (("method" = ANY (ARRAY['pickup'::"text", 'courier'::"text"]))),
    CONSTRAINT "shipments_shipping_cost_check" CHECK ((("shipping_cost" IS NULL) OR ("shipping_cost" >= (0)::numeric))),
    CONSTRAINT "shipments_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'awaiting_client'::"text", 'scheduled'::"text", 'shipped'::"text"]))),
    CONSTRAINT "shipments_tracking_url_check" CHECK ((("tracking_url" IS NULL) OR ("tracking_url" ~* '^https?://'::"text")))
);


ALTER TABLE "public"."shipments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signup_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "label" "text",
    "max_uses" integer,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "public"."app_role" DEFAULT 'client'::"public"."app_role" NOT NULL,
    CONSTRAINT "signup_codes_code_not_empty" CHECK (("length"(TRIM(BOTH FROM "code")) >= 4)),
    CONSTRAINT "signup_codes_max_uses_positive" CHECK ((("max_uses" IS NULL) OR ("max_uses" > 0)))
);


ALTER TABLE "public"."signup_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "quantity_issued" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_request_items_description_check" CHECK ((("length"(TRIM(BOTH FROM "description")) >= 1) AND ("length"(TRIM(BOTH FROM "description")) <= 300))),
    CONSTRAINT "stock_request_items_quantity_check" CHECK (("quantity" > (0)::numeric)),
    CONSTRAINT "stock_request_items_quantity_issued_check" CHECK (("quantity_issued" >= (0)::numeric)),
    CONSTRAINT "stock_request_items_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'ordering'::"text", 'issued'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."stock_request_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "requested_by" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "needed_by" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_requests_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 1000))),
    CONSTRAINT "stock_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'partial'::"text", 'fulfilled'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."stock_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suppliers_name_check" CHECK ((("length"(TRIM(BOTH FROM "name")) >= 1) AND ("length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "suppliers_notes_check" CHECK ((("notes" IS NULL) OR ("length"("notes") <= 1000)))
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_notices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "url" "text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."system_notices" REPLICA IDENTITY FULL;


ALTER TABLE "public"."system_notices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_handoffs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "from_user" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "hours" numeric,
    "next_task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_handoffs_hours_check" CHECK ((("hours" IS NULL) OR (("hours" > (0)::numeric) AND ("hours" <= (24)::numeric)))),
    CONSTRAINT "task_handoffs_note_check" CHECK ((("length"(TRIM(BOTH FROM "note")) >= 1) AND ("length"(TRIM(BOTH FROM "note")) <= 2000)))
);


ALTER TABLE "public"."task_handoffs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "hours" numeric NOT NULL,
    "work_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "time_entries_hours_check" CHECK ((("hours" > (0)::numeric) AND ("hours" <= (24)::numeric))),
    CONSTRAINT "time_entries_note_check" CHECK ((("note" IS NULL) OR ("length"("note") <= 500)))
);


ALTER TABLE "public"."time_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "user_id" "uuid" NOT NULL,
    "permission" "text" NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_permissions_permission_check" CHECK (("permission" = ANY ("public"."permission_keys"())))
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'client'::"public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workshop_admin_contacts" (
    "id" integer DEFAULT 1 NOT NULL,
    "super_admin_email" "text",
    "vapid_public_key" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workshop_admin_contacts_single_row" CHECK (("id" = 1))
);


ALTER TABLE "public"."workshop_admin_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workshop_settings" (
    "id" integer DEFAULT 1 NOT NULL,
    "workshop_name" "text",
    "contact_email" "text",
    "phone" "text",
    "address" "text",
    "default_tax_rate" numeric DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "notify_job_status" boolean DEFAULT true,
    "notify_new_appointment" boolean DEFAULT true,
    "notify_low_inventory" boolean DEFAULT true,
    "login_image_url" "text",
    "email_notifications_enabled" boolean DEFAULT false,
    "from_email" "text",
    "logo_url" "text",
    "instance_version" "text" DEFAULT '1.0.0'::"text",
    "monthly_goal" numeric(10,2),
    "feature_flags" "jsonb" DEFAULT '{"goals": true, "reports": true, "appointments": true, "client_portal": true}'::"jsonb",
    "vapid_public_key" "text",
    "enabled_currencies" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "brand_primary_hsl" "text",
    "brand_accent_hsl" "text",
    "project_ref_prefix" "text" DEFAULT 'EDL'::"text" NOT NULL,
    "purchase_manager_limit" numeric DEFAULT 1000 NOT NULL,
    "overhead_percent" numeric DEFAULT 15 NOT NULL,
    CONSTRAINT "single_row" CHECK (("id" = 1)),
    CONSTRAINT "workshop_settings_overhead_percent_check" CHECK ((("overhead_percent" >= (0)::numeric) AND ("overhead_percent" <= (100)::numeric))),
    CONSTRAINT "workshop_settings_project_ref_prefix_check" CHECK (("project_ref_prefix" ~ '^[A-Z0-9]{2,6}$'::"text")),
    CONSTRAINT "workshop_settings_purchase_manager_limit_check" CHECK (("purchase_manager_limit" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."workshop_settings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."workshop_settings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."workshop_settings_public" WITH ("security_invoker"='true') AS
 SELECT "id",
    "workshop_name",
    "logo_url",
    "login_image_url",
    "currency",
    ( SELECT "wac"."vapid_public_key"
           FROM "public"."workshop_admin_contacts" "wac"
          WHERE ("wac"."id" = 1)) AS "vapid_public_key"
   FROM "public"."workshop_settings" "ws";


ALTER VIEW "public"."workshop_settings_public" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_onboarding_progress"
    ADD CONSTRAINT "admin_onboarding_progress_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcasts"
    ADD CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bug_reports"
    ADD CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_requests"
    ADD CONSTRAINT "client_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_prefs"
    ADD CONSTRAINT "dashboard_prefs_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."department_members"
    ADD CONSTRAINT "department_members_pkey" PRIMARY KEY ("department_id", "user_id");



ALTER TABLE ONLY "public"."department_permissions"
    ADD CONSTRAINT "department_permissions_pkey" PRIMARY KEY ("department_id", "permission");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dismissed_broadcasts"
    ADD CONSTRAINT "dismissed_broadcasts_pkey" PRIMARY KEY ("user_id", "broadcast_id");



ALTER TABLE ONLY "public"."dismissed_notices"
    ADD CONSTRAINT "dismissed_notices_pkey" PRIMARY KEY ("user_id", "notice_id");



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_pdf_versions"
    ADD CONSTRAINT "invoice_pdf_versions_invoice_id_version_key" UNIQUE ("invoice_id", "version");



ALTER TABLE ONLY "public"."invoice_pdf_versions"
    ADD CONSTRAINT "invoice_pdf_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_attachments"
    ADD CONSTRAINT "job_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_comments"
    ADD CONSTRAINT "job_comments_legacy_update_id_key" UNIQUE ("legacy_update_id");



ALTER TABLE ONLY "public"."job_comments"
    ADD CONSTRAINT "job_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_ratings"
    ADD CONSTRAINT "job_ratings_job_id_client_id_key" UNIQUE ("job_id", "client_id");



ALTER TABLE ONLY "public"."job_ratings"
    ADD CONSTRAINT "job_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_task_notes"
    ADD CONSTRAINT "job_task_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_tasks"
    ADD CONSTRAINT "job_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labour_rates"
    ADD CONSTRAINT "labour_rates_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."mfa_backup_codes"
    ADD CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mfa_backup_codes"
    ADD CONSTRAINT "mfa_backup_codes_user_id_code_hash_key" UNIQUE ("user_id", "code_hash");



ALTER TABLE ONLY "public"."mfa_rate_limits"
    ADD CONSTRAINT "mfa_rate_limits_pkey" PRIMARY KEY ("user_id", "action");



ALTER TABLE ONLY "public"."mfa_trusted_devices"
    ADD CONSTRAINT "mfa_trusted_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mfa_trusted_devices"
    ADD CONSTRAINT "mfa_trusted_devices_user_id_token_hash_key" UNIQUE ("user_id", "token_hash");



ALTER TABLE ONLY "public"."monthly_revenue_goals"
    ADD CONSTRAINT "monthly_revenue_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_revenue_goals"
    ADD CONSTRAINT "monthly_revenue_goals_year_month_key" UNIQUE ("year", "month");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_events"
    ADD CONSTRAINT "project_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_quote_items"
    ADD CONSTRAINT "project_quote_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_quotes"
    ADD CONSTRAINT "project_quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_ref_counters"
    ADD CONSTRAINT "project_ref_counters_pkey" PRIMARY KEY ("period");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."request_quote_items"
    ADD CONSTRAINT "request_quote_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_job_id_key" UNIQUE ("job_id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signup_codes"
    ADD CONSTRAINT "signup_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."signup_codes"
    ADD CONSTRAINT "signup_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_request_items"
    ADD CONSTRAINT "stock_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_requests"
    ADD CONSTRAINT "stock_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_notices"
    ADD CONSTRAINT "system_notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_handoffs"
    ADD CONSTRAINT "task_handoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id", "permission");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."workshop_admin_contacts"
    ADD CONSTRAINT "workshop_admin_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workshop_settings"
    ADD CONSTRAINT "workshop_settings_pkey" PRIMARY KEY ("id");



CREATE INDEX "client_requests_client_id_idx" ON "public"."client_requests" USING "btree" ("client_id");



CREATE INDEX "client_requests_status_idx" ON "public"."client_requests" USING "btree" ("status");



CREATE INDEX "department_members_user_idx" ON "public"."department_members" USING "btree" ("user_id");



CREATE UNIQUE INDEX "departments_name_key" ON "public"."departments" USING "btree" ("lower"(TRIM(BOTH FROM "name")));



CREATE INDEX "idx_activity_logs_created" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_record_id" ON "public"."activity_logs" USING "btree" ("record_id");



CREATE INDEX "idx_activity_logs_table_name" ON "public"."activity_logs" USING "btree" ("table_name");



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_appointments_client_id" ON "public"."appointments" USING "btree" ("client_id");



CREATE INDEX "idx_appointments_status" ON "public"."appointments" USING "btree" ("status");



CREATE INDEX "idx_broadcasts_created" ON "public"."broadcasts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inv_tx_item_id" ON "public"."inventory_transactions" USING "btree" ("item_id");



CREATE INDEX "idx_inv_tx_user_id" ON "public"."inventory_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_invoices_client_id" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_job_attachments_job_id" ON "public"."job_attachments" USING "btree" ("job_id");



CREATE INDEX "idx_job_tasks_assigned_to" ON "public"."job_tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_job_tasks_job_id" ON "public"."job_tasks" USING "btree" ("job_id");



CREATE INDEX "idx_jobs_assigned_staff_id" ON "public"."jobs" USING "btree" ("assigned_staff_id");



CREATE INDEX "idx_jobs_client_id" ON "public"."jobs" USING "btree" ("client_id");



CREATE INDEX "idx_jobs_created_at" ON "public"."jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_jobs_source_request_id" ON "public"."jobs" USING "btree" ("source_request_id");



CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("status");



CREATE INDEX "idx_notifications_user_created" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_system_notices_created" ON "public"."system_notices" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_system_notices_created_at" ON "public"."system_notices" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_system_notices_user_id" ON "public"."system_notices" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_user_id_role" ON "public"."user_roles" USING "btree" ("user_id", "role");



CREATE INDEX "invoice_pdf_versions_invoice_id_idx" ON "public"."invoice_pdf_versions" USING "btree" ("invoice_id", "generated_at" DESC);



CREATE INDEX "job_tasks_assigned_idx" ON "public"."job_tasks" USING "btree" ("assigned_to");



CREATE INDEX "job_tasks_department_idx" ON "public"."job_tasks" USING "btree" ("department_id");



CREATE UNIQUE INDEX "jobs_ref_key" ON "public"."jobs" USING "btree" ("ref");



CREATE INDEX "mfa_backup_codes_user_idx" ON "public"."mfa_backup_codes" USING "btree" ("user_id");



CREATE INDEX "mfa_trusted_devices_user_idx" ON "public"."mfa_trusted_devices" USING "btree" ("user_id");



CREATE INDEX "project_events_job_idx" ON "public"."project_events" USING "btree" ("job_id", "created_at");



CREATE INDEX "project_quote_items_quote_idx" ON "public"."project_quote_items" USING "btree" ("quote_id", "position");



CREATE INDEX "project_quotes_job_idx" ON "public"."project_quotes" USING "btree" ("job_id");



CREATE UNIQUE INDEX "project_quotes_number_key" ON "public"."project_quotes" USING "btree" ("job_id", "kind", "number");



CREATE INDEX "project_quotes_status_idx" ON "public"."project_quotes" USING "btree" ("status");



CREATE INDEX "purchase_order_items_po_idx" ON "public"."purchase_order_items" USING "btree" ("po_id", "position");



CREATE UNIQUE INDEX "purchase_orders_number_key" ON "public"."purchase_orders" USING "btree" ("po_number") WHERE ("po_number" <> ''::"text");



CREATE INDEX "purchase_orders_status_idx" ON "public"."purchase_orders" USING "btree" ("status");



CREATE INDEX "shipments_status_idx" ON "public"."shipments" USING "btree" ("status");



CREATE INDEX "stock_request_items_request_idx" ON "public"."stock_request_items" USING "btree" ("request_id");



CREATE INDEX "stock_requests_job_idx" ON "public"."stock_requests" USING "btree" ("job_id");



CREATE INDEX "stock_requests_status_idx" ON "public"."stock_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "suppliers_name_key" ON "public"."suppliers" USING "btree" ("lower"(TRIM(BOTH FROM "name")));



CREATE INDEX "task_handoffs_job_idx" ON "public"."task_handoffs" USING "btree" ("job_id", "created_at");



CREATE INDEX "task_handoffs_task_idx" ON "public"."task_handoffs" USING "btree" ("task_id");



CREATE INDEX "time_entries_job_idx" ON "public"."time_entries" USING "btree" ("job_id");



CREATE INDEX "time_entries_user_idx" ON "public"."time_entries" USING "btree" ("user_id", "work_date");



CREATE OR REPLACE TRIGGER "admin_onboarding_progress_updated_at" BEFORE UPDATE ON "public"."admin_onboarding_progress" FOR EACH ROW EXECUTE FUNCTION "public"."admin_onboarding_progress_set_updated_at"();



CREATE OR REPLACE TRIGGER "broadcasts_set_updated_at" BEFORE UPDATE ON "public"."broadcasts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "client_requests_activity_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."client_requests" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "client_requests_set_updated_at" BEFORE UPDATE ON "public"."client_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "department_members_log" AFTER INSERT OR DELETE OR UPDATE ON "public"."department_members" FOR EACH ROW EXECUTE FUNCTION "public"."log_access_change"();



CREATE OR REPLACE TRIGGER "department_permissions_log" AFTER INSERT OR DELETE ON "public"."department_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."log_access_change"();



CREATE OR REPLACE TRIGGER "departments_set_updated_at" BEFORE UPDATE ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "job_attachments_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."job_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."job_attachments_guard"();



CREATE OR REPLACE TRIGGER "job_tasks_start_project" AFTER UPDATE OF "status" ON "public"."job_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."job_tasks_start_project"();



CREATE OR REPLACE TRIGGER "jobs_assign_ref" BEFORE INSERT OR UPDATE OF "ref" ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."jobs_assign_ref"();



CREATE OR REPLACE TRIGGER "jobs_open_shipment" AFTER UPDATE OF "status" ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."jobs_open_shipment"();



CREATE OR REPLACE TRIGGER "jobs_record_events" AFTER INSERT OR UPDATE OF "status", "assigned_staff_id" ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."jobs_record_events"();



CREATE OR REPLACE TRIGGER "on_job_completed_create_invoice" AFTER UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."create_invoice_on_job_completed"();



CREATE OR REPLACE TRIGGER "prevent_manager_role_escalation_trg" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_manager_role_escalation"();



CREATE OR REPLACE TRIGGER "project_quote_items_total" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."project_quote_items_total"();



CREATE OR REPLACE TRIGGER "project_quotes_number" BEFORE INSERT ON "public"."project_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."project_quotes_number"();



CREATE OR REPLACE TRIGGER "project_quotes_set_updated_at" BEFORE UPDATE ON "public"."project_quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "purchase_order_items_total" AFTER INSERT OR DELETE OR UPDATE ON "public"."purchase_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."purchase_order_items_total"();



CREATE OR REPLACE TRIGGER "purchase_orders_number" BEFORE INSERT ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."purchase_orders_number"();



CREATE OR REPLACE TRIGGER "purchase_orders_set_updated_at" BEFORE UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "push_subscriptions_set_updated_at" BEFORE UPDATE ON "public"."push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "saved_reports_set_updated_at" BEFORE UPDATE ON "public"."saved_reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_request_quote_items_updated_at" BEFORE UPDATE ON "public"."request_quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "shipments_set_updated_at" BEFORE UPDATE ON "public"."shipments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "signup_codes_updated_at" BEFORE UPDATE ON "public"."signup_codes" FOR EACH ROW EXECUTE FUNCTION "public"."signup_codes_set_updated_at"();



CREATE OR REPLACE TRIGGER "stock_requests_set_updated_at" BEFORE UPDATE ON "public"."stock_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "suppliers_set_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "time_entries_sync_hours" AFTER INSERT OR DELETE OR UPDATE ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."time_entries_sync_hours"();



CREATE OR REPLACE TRIGGER "trg_activity_log_appointments" AFTER INSERT OR DELETE OR UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_activity_log_inventory" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_activity_log_invoices" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_activity_log_jobs" AFTER INSERT OR DELETE OR UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_activity_log_profiles" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_activity_log_roles" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_activity_log_tasks" AFTER INSERT OR DELETE OR UPDATE ON "public"."job_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."log_activity"();



CREATE OR REPLACE TRIGGER "trg_prevent_user_roles_user_id_change" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_user_roles_user_id_change"();



CREATE OR REPLACE TRIGGER "user_permissions_log" AFTER INSERT OR DELETE ON "public"."user_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."log_access_change"();



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_onboarding_progress"
    ADD CONSTRAINT "admin_onboarding_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."client_requests"
    ADD CONSTRAINT "client_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_requests"
    ADD CONSTRAINT "client_requests_converted_job_id_fkey" FOREIGN KEY ("converted_job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_requests"
    ADD CONSTRAINT "client_requests_quoted_invoice_id_fkey" FOREIGN KEY ("quoted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_requests"
    ADD CONSTRAINT "client_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard_prefs"
    ADD CONSTRAINT "dashboard_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."department_members"
    ADD CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."department_members"
    ADD CONSTRAINT "department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."department_permissions"
    ADD CONSTRAINT "department_permissions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dismissed_broadcasts"
    ADD CONSTRAINT "dismissed_broadcasts_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dismissed_broadcasts"
    ADD CONSTRAINT "dismissed_broadcasts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dismissed_notices"
    ADD CONSTRAINT "dismissed_notices_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "public"."system_notices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dismissed_notices"
    ADD CONSTRAINT "dismissed_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_flags"
    ADD CONSTRAINT "feature_flags_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_pdf_versions"
    ADD CONSTRAINT "invoice_pdf_versions_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_pdf_versions"
    ADD CONSTRAINT "invoice_pdf_versions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id");



ALTER TABLE ONLY "public"."job_attachments"
    ADD CONSTRAINT "job_attachments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_attachments"
    ADD CONSTRAINT "job_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."job_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_comments"
    ADD CONSTRAINT "job_comments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_comments"
    ADD CONSTRAINT "job_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_ratings"
    ADD CONSTRAINT "job_ratings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_task_notes"
    ADD CONSTRAINT "job_task_notes_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."job_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_tasks"
    ADD CONSTRAINT "job_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_tasks"
    ADD CONSTRAINT "job_tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_tasks"
    ADD CONSTRAINT "job_tasks_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_tasks"
    ADD CONSTRAINT "job_tasks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_tasks"
    ADD CONSTRAINT "job_tasks_rework_of_fkey" FOREIGN KEY ("rework_of") REFERENCES "public"."job_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_source_request_id_fkey" FOREIGN KEY ("source_request_id") REFERENCES "public"."client_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_rates"
    ADD CONSTRAINT "labour_rates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_rates"
    ADD CONSTRAINT "labour_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_backup_codes"
    ADD CONSTRAINT "mfa_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mfa_trusted_devices"
    ADD CONSTRAINT "mfa_trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_revenue_goals"
    ADD CONSTRAINT "monthly_revenue_goals_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_events"
    ADD CONSTRAINT "project_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_quote_items"
    ADD CONSTRAINT "project_quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."project_quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_quotes"
    ADD CONSTRAINT "project_quotes_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_quotes"
    ADD CONSTRAINT "project_quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_quotes"
    ADD CONSTRAINT "project_quotes_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_quotes"
    ADD CONSTRAINT "project_quotes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "public"."stock_request_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_quote_items"
    ADD CONSTRAINT "request_quote_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."client_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_reports"
    ADD CONSTRAINT "saved_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_shipped_by_fkey" FOREIGN KEY ("shipped_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_request_items"
    ADD CONSTRAINT "stock_request_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_request_items"
    ADD CONSTRAINT "stock_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."stock_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_requests"
    ADD CONSTRAINT "stock_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_requests"
    ADD CONSTRAINT "stock_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_requests"
    ADD CONSTRAINT "stock_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."job_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_handoffs"
    ADD CONSTRAINT "task_handoffs_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_handoffs"
    ADD CONSTRAINT "task_handoffs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_handoffs"
    ADD CONSTRAINT "task_handoffs_next_task_id_fkey" FOREIGN KEY ("next_task_id") REFERENCES "public"."job_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_handoffs"
    ADD CONSTRAINT "task_handoffs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."job_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."job_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admin and manager operations require MFA" ON "public"."user_roles" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Admin and manager write operations on profiles require MFA" ON "public"."profiles" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Admin/manager manage request items" ON "public"."request_quote_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admin/manager read all request items" ON "public"."request_quote_items" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admins and managers can create signup codes" ON "public"."signup_codes" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"])))));



CREATE POLICY "Admins and managers can delete signup codes" ON "public"."signup_codes" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admins and managers can update requests" ON "public"."client_requests" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admins and managers can update signup codes" ON "public"."signup_codes" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"]))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"])))));



CREATE POLICY "Admins and managers can view all requests" ON "public"."client_requests" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admins and managers can view signup codes" ON "public"."signup_codes" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admins and managers manage pdf versions" ON "public"."invoice_pdf_versions" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Admins can create own onboarding progress" ON "public"."admin_onboarding_progress" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all appointments" ON "public"."appointments" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all invoice items" ON "public"."invoice_items" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all invoices" ON "public"."invoices" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all jobs" ON "public"."jobs" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage inventory" ON "public"."inventory_items" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage inventory transactions" ON "public"."inventory_transactions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read own onboarding progress" ON "public"."admin_onboarding_progress" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins can read workshop settings" ON "public"."workshop_settings" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update all profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update own onboarding progress" ON "public"."admin_onboarding_progress" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins can view activity logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage admin contacts" ON "public"."workshop_admin_contacts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage broadcasts" ON "public"."broadcasts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage bug reports" ON "public"."bug_reports" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage departments" ON "public"."departments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage job attachments" ON "public"."job_attachments" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage memberships" ON "public"."department_members" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (NOT "public"."has_role"("user_id", 'client'::"public"."app_role"))));



CREATE POLICY "Admins manage permissions" ON "public"."user_permissions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (NOT "public"."has_role"("user_id", 'client'::"public"."app_role"))));



CREATE POLICY "Admins manage system notices" ON "public"."system_notices" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage task notes" ON "public"."job_task_notes" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage team permissions" ON "public"."department_permissions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins set labour rates" ON "public"."labour_rates" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins view ratings" ON "public"."job_ratings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Assigned staff can update own task status" ON "public"."job_tasks" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ("assigned_to" = "auth"."uid"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ("assigned_to" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text"]))));



CREATE POLICY "Authenticated users can view active broadcasts" ON "public"."broadcasts" FOR SELECT TO "authenticated" USING ((("active" = true) AND ("starts_at" <= "now"()) AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));



CREATE POLICY "Authenticated users read feature flags" ON "public"."feature_flags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Block direct delete to activity_logs" ON "public"."activity_logs" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Block direct insert to activity_logs" ON "public"."activity_logs" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Block direct update to activity_logs" ON "public"."activity_logs" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "Client reads own request items" ON "public"."request_quote_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."client_requests" "cr"
  WHERE (("cr"."id" = "request_quote_items"."request_id") AND ("cr"."client_id" = "auth"."uid"())))));



CREATE POLICY "Clients can cancel own pending requests" ON "public"."client_requests" FOR UPDATE TO "authenticated" USING ((("client_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."client_request_status"))) WITH CHECK ((("client_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"public"."client_request_status", 'cancelled'::"public"."client_request_status"]))));



CREATE POLICY "Clients can create appointments" ON "public"."appointments" FOR INSERT WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients can create own requests" ON "public"."client_requests" FOR INSERT TO "authenticated" WITH CHECK ((("client_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."client_request_status")));



CREATE POLICY "Clients can update own appointments" ON "public"."appointments" FOR UPDATE USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients can view own appointments" ON "public"."appointments" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients can view own invoice items" ON "public"."invoice_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_items"."invoice_id") AND ("invoices"."client_id" = "auth"."uid"())))));



CREATE POLICY "Clients can view own invoices" ON "public"."invoices" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients can view own jobs" ON "public"."jobs" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients can view own requests" ON "public"."client_requests" FOR SELECT TO "authenticated" USING (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients insert job attachments" ON "public"."job_attachments" FOR INSERT WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_attachments"."job_id") AND ("jobs"."client_id" = "auth"."uid"()))))));



CREATE POLICY "Clients manage own ratings" ON "public"."job_ratings" USING (("client_id" = "auth"."uid"())) WITH CHECK (("client_id" = "auth"."uid"()));



CREATE POLICY "Clients read own invoice pdf versions" ON "public"."invoice_pdf_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."id" = "invoice_pdf_versions"."invoice_id") AND ("i"."client_id" = "auth"."uid"())))));



CREATE POLICY "Clients read their milestones" ON "public"."project_events" FOR SELECT TO "authenticated" USING (("client_visible" AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "project_events"."job_id") AND ("j"."client_id" = "auth"."uid"()))))));



CREATE POLICY "Clients read their quotes" ON "public"."project_quotes" FOR SELECT TO "authenticated" USING ((("status" = ANY (ARRAY['sent'::"text", 'accepted'::"text", 'declined'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "project_quotes"."job_id") AND ("j"."client_id" = "auth"."uid"()))))));



CREATE POLICY "Clients read their shipment" ON "public"."shipments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "shipments"."job_id") AND ("j"."client_id" = "auth"."uid"())))));



CREATE POLICY "Clients view job attachments" ON "public"."job_attachments" FOR SELECT USING ((("task_id" IS NULL) AND ("kind" = ANY (ARRAY['intake'::"text", 'shared'::"text", 'delivery'::"text", 'client'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_attachments"."job_id") AND ("j"."client_id" = "auth"."uid"()))))));



CREATE POLICY "Deny anon insert to activity_logs" ON "public"."activity_logs" FOR INSERT TO "anon" WITH CHECK (false);



CREATE POLICY "Deny anon select activity_logs" ON "public"."activity_logs" FOR SELECT TO "anon" USING (false);



CREATE POLICY "Edit lines of draft orders" ON "public"."purchase_order_items" TO "authenticated" USING (("public"."is_storekeeper"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "p"
  WHERE (("p"."id" = "purchase_order_items"."po_id") AND ("p"."status" = 'draft'::"text")))))) WITH CHECK (("public"."is_storekeeper"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "p"
  WHERE (("p"."id" = "purchase_order_items"."po_id") AND ("p"."status" = 'draft'::"text"))))));



CREATE POLICY "Edit lines of draft quotes" ON "public"."project_quote_items" TO "authenticated" USING (("public"."can_quote"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."project_quotes" "q"
  WHERE (("q"."id" = "project_quote_items"."quote_id") AND ("q"."status" = 'draft'::"text")))))) WITH CHECK (("public"."can_quote"("auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."project_quotes" "q"
  WHERE (("q"."id" = "project_quote_items"."quote_id") AND ("q"."status" = 'draft'::"text"))))));



CREATE POLICY "Feature gate appointments" ON "public"."appointments" AS RESTRICTIVE TO "authenticated" USING ("public"."is_feature_enabled"('appointments'::"text")) WITH CHECK ("public"."is_feature_enabled"('appointments'::"text"));



CREATE POLICY "Feature gate client portal" ON "public"."invoice_items" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal" ON "public"."invoices" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal" ON "public"."job_attachments" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal" ON "public"."job_ratings" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal" ON "public"."job_task_notes" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal" ON "public"."job_tasks" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal" ON "public"."jobs" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate client portal appointments" ON "public"."appointments" AS RESTRICTIVE TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text"))) WITH CHECK (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) OR "public"."is_feature_enabled"('client_portal'::"text")));



CREATE POLICY "Feature gate goals" ON "public"."monthly_revenue_goals" AS RESTRICTIVE TO "authenticated" USING ("public"."is_feature_enabled"('goals'::"text")) WITH CHECK ("public"."is_feature_enabled"('goals'::"text"));



CREATE POLICY "Front of house deletes drafts" ON "public"."project_quotes" FOR DELETE TO "authenticated" USING (("public"."can_quote"("auth"."uid"()) AND ("status" = 'draft'::"text")));



CREATE POLICY "Front of house drafts quotes" ON "public"."project_quotes" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_quote"("auth"."uid"()) AND ("status" = 'draft'::"text") AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Front of house edits drafts" ON "public"."project_quotes" FOR UPDATE TO "authenticated" USING (("public"."can_quote"("auth"."uid"()) AND ("status" = 'draft'::"text"))) WITH CHECK (("status" = 'draft'::"text"));



CREATE POLICY "Managers can delete non-privileged roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"]))));



CREATE POLICY "Managers can insert non-privileged roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"]))));



CREATE POLICY "Managers can insert notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("public"."has_role"("user_id", 'staff'::"public"."app_role") OR "public"."has_role"("user_id", 'client'::"public"."app_role") OR ("user_id" = "auth"."uid"()))));



CREATE POLICY "Managers can manage all appointments" ON "public"."appointments" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can manage all invoice items" ON "public"."invoice_items" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can manage all invoices" ON "public"."invoices" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can manage all jobs" ON "public"."jobs" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can manage inventory" ON "public"."inventory_items" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can manage inventory transactions" ON "public"."inventory_transactions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can read workshop settings" ON "public"."workshop_settings" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can update non-privileged roles" ON "public"."user_roles" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"])) AND ("user_id" <> "auth"."uid"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") AND ("role" = ANY (ARRAY['staff'::"public"."app_role", 'client'::"public"."app_role"])) AND ("user_id" <> "auth"."uid"())));



CREATE POLICY "Managers can view activity logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers can view roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers manage job attachments" ON "public"."job_attachments" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers manage task notes" ON "public"."job_task_notes" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers view bug reports" ON "public"."bug_reports" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Managers view ratings" ON "public"."job_ratings" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"));



CREATE POLICY "Owners change saved reports" ON "public"."saved_reports" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK ("public"."has_permission"("auth"."uid"(), 'reports'::"text"));



CREATE POLICY "Owners delete saved reports" ON "public"."saved_reports" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "People fix their own time" ON "public"."time_entries" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "People log their own time" ON "public"."time_entries" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "People read own permissions" ON "public"."user_permissions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "Planners manage tasks" ON "public"."job_tasks" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."has_permission"("auth"."uid"(), 'planning'::"text"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."has_permission"("auth"."uid"(), 'planning'::"text")));



CREATE POLICY "Read order lines with their order" ON "public"."purchase_order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders" "p"
  WHERE ("p"."id" = "purchase_order_items"."po_id"))));



CREATE POLICY "Read quote lines with their quote" ON "public"."project_quote_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."project_quotes" "q"
  WHERE ("q"."id" = "project_quote_items"."quote_id"))));



CREATE POLICY "Read request lines with their request" ON "public"."stock_request_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stock_requests" "r"
  WHERE ("r"."id" = "stock_request_items"."request_id"))));



CREATE POLICY "Reception creates projects" ON "public"."jobs" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."has_permission"("auth"."uid"(), 'reception'::"text")));



CREATE POLICY "Reception reads requests" ON "public"."client_requests" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."has_permission"("auth"."uid"(), 'reception'::"text")));



CREATE POLICY "Reporting reads labour rates" ON "public"."labour_rates" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'reports'::"text"));



CREATE POLICY "Reporting reads saved reports" ON "public"."saved_reports" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'reports'::"text"));



CREATE POLICY "Reporting saves reports" ON "public"."saved_reports" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"("auth"."uid"(), 'reports'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."activity_logs" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."invoice_items" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."invoices" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."jobs" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."profiles" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."workshop_admin_contacts" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Require AAL2 for elevated roles" ON "public"."workshop_settings" AS RESTRICTIVE TO "authenticated" USING ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text"))) WITH CHECK ((((NOT "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) AND (NOT "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role"))) OR (("auth"."jwt"() ->> 'aal'::"text") = 'aal2'::"text")));



CREATE POLICY "Staff can insert inventory transactions" ON "public"."inventory_transactions" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Staff can insert notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."assigned_staff_id" = "auth"."uid"()) AND (("jobs"."client_id" = "notifications"."user_id") OR ("notifications"."user_id" = "auth"."uid"()))))) OR ("user_id" = "auth"."uid"()))));



CREATE POLICY "Staff can update assigned jobs" ON "public"."jobs" FOR UPDATE USING (("assigned_staff_id" = "auth"."uid"()));



CREATE POLICY "Staff can view appointments for assigned clients" ON "public"."appointments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."assigned_staff_id" = "auth"."uid"()) AND ("j"."client_id" = "appointments"."client_id"))))));



CREATE POLICY "Staff can view assigned invoice items" ON "public"."invoice_items" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."invoices" "i"
     JOIN "public"."jobs" "j" ON (("j"."id" = "i"."job_id")))
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("j"."assigned_staff_id" = "auth"."uid"()))))));



CREATE POLICY "Staff can view assigned invoices" ON "public"."invoices" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ("job_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "invoices"."job_id") AND ("j"."assigned_staff_id" = "auth"."uid"()))))));



CREATE POLICY "Staff can view assigned job tasks" ON "public"."job_tasks" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_tasks"."job_id") AND ("jobs"."assigned_staff_id" = "auth"."uid"())))) OR ("assigned_to" = "auth"."uid"())));



CREATE POLICY "Staff can view assigned jobs" ON "public"."jobs" FOR SELECT USING (("assigned_staff_id" = "auth"."uid"()));



CREATE POLICY "Staff can view inventory" ON "public"."inventory_items" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role"));



CREATE POLICY "Staff can view/create inventory transactions" ON "public"."inventory_transactions" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role"));



CREATE POLICY "Staff insert job attachments" ON "public"."job_attachments" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ("uploaded_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_attachments"."job_id") AND ("jobs"."assigned_staff_id" = "auth"."uid"()))))));



CREATE POLICY "Staff insert task notes" ON "public"."job_task_notes" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Staff view job attachments" ON "public"."job_attachments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_attachments"."job_id") AND ("jobs"."assigned_staff_id" = "auth"."uid"()))))));



CREATE POLICY "Staff view ratings for assigned jobs" ON "public"."job_ratings" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "job_ratings"."job_id") AND ("jobs"."assigned_staff_id" = "auth"."uid"()))))));



CREATE POLICY "Staff view task notes" ON "public"."job_task_notes" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."job_tasks" "jt"
     JOIN "public"."jobs" "j" ON (("j"."id" = "jt"."job_id")))
  WHERE (("jt"."id" = "job_task_notes"."task_id") AND (("jt"."assigned_to" = "auth"."uid"()) OR ("j"."assigned_staff_id" = "auth"."uid"())))))));



CREATE POLICY "Stores and approvers read purchase orders" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING (("public"."is_storekeeper"("auth"."uid"()) OR "public"."has_permission"("auth"."uid"(), 'inventory_approve'::"text")));



CREATE POLICY "Stores deletes draft purchase orders" ON "public"."purchase_orders" FOR DELETE TO "authenticated" USING (("public"."is_storekeeper"("auth"."uid"()) AND ("status" = 'draft'::"text")));



CREATE POLICY "Stores drafts purchase orders" ON "public"."purchase_orders" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_storekeeper"("auth"."uid"()) AND ("status" = 'draft'::"text")));



CREATE POLICY "Stores edits draft purchase orders" ON "public"."purchase_orders" FOR UPDATE TO "authenticated" USING (("public"."is_storekeeper"("auth"."uid"()) AND ("status" = 'draft'::"text"))) WITH CHECK (("status" = 'draft'::"text"));



CREATE POLICY "Stores manages stock" ON "public"."inventory_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."is_storekeeper"("auth"."uid"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."is_storekeeper"("auth"."uid"())));



CREATE POLICY "Stores manages suppliers" ON "public"."suppliers" TO "authenticated" USING ("public"."is_storekeeper"("auth"."uid"())) WITH CHECK ("public"."is_storekeeper"("auth"."uid"()));



CREATE POLICY "Stores reads suppliers" ON "public"."suppliers" FOR SELECT TO "authenticated" USING (("public"."is_storekeeper"("auth"."uid"()) OR "public"."has_permission"("auth"."uid"(), 'inventory_approve'::"text")));



CREATE POLICY "Stores records movements" ON "public"."inventory_transactions" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."is_storekeeper"("auth"."uid"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."is_storekeeper"("auth"."uid"())));



CREATE POLICY "Stores updates parts requests" ON "public"."stock_requests" FOR UPDATE TO "authenticated" USING ("public"."is_storekeeper"("auth"."uid"())) WITH CHECK ("public"."is_storekeeper"("auth"."uid"()));



CREATE POLICY "Stores updates request lines" ON "public"."stock_request_items" FOR UPDATE TO "authenticated" USING ("public"."is_storekeeper"("auth"."uid"())) WITH CHECK ("public"."is_storekeeper"("auth"."uid"()));



CREATE POLICY "Team and stores read parts requests" ON "public"."stock_requests" FOR SELECT TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND ("public"."is_storekeeper"("auth"."uid"()) OR "public"."can_view_job"("auth"."uid"(), "job_id"))));



CREATE POLICY "Team leads assign team tasks" ON "public"."job_tasks" FOR UPDATE TO "authenticated" USING (("department_id" IN ( SELECT "m"."department_id"
   FROM "public"."department_members" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND "m"."is_lead")))) WITH CHECK ((("department_id" IN ( SELECT "m"."department_id"
   FROM "public"."department_members" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND "m"."is_lead"))) AND (("assigned_to" IS NULL) OR ("assigned_to" IN ( SELECT "m"."user_id"
   FROM "public"."department_members" "m"
  WHERE ("m"."department_id" = "job_tasks"."department_id"))))));



CREATE POLICY "Team members add project files" ON "public"."job_attachments" FOR INSERT TO "authenticated" WITH CHECK ((("uploaded_by" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_view_job"("auth"."uid"(), "job_id") AND ("kind" = ANY (ARRAY['intake'::"text", 'work'::"text", 'handoff'::"text", 'delivery'::"text"])) AND (("kind" <> 'intake'::"text") OR "public"."has_permission"("auth"."uid"(), 'reception'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_attachments"."job_id") AND ("j"."assigned_staff_id" = "auth"."uid"()))))) AND (("kind" <> 'delivery'::"text") OR "public"."has_permission"("auth"."uid"(), 'shipping'::"text"))));



CREATE POLICY "Team members add task notes" ON "public"."job_task_notes" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."job_tasks" "t"
  WHERE (("t"."id" = "job_task_notes"."task_id") AND "public"."can_view_job"("auth"."uid"(), "t"."job_id"))))));



CREATE POLICY "Team members claim team tasks" ON "public"."job_tasks" FOR UPDATE TO "authenticated" USING ((("assigned_to" IS NULL) AND ("status" <> 'completed'::"text") AND ("department_id" IN ( SELECT "m"."department_id"
   FROM "public"."department_members" "m"
  WHERE ("m"."user_id" = "auth"."uid"()))))) WITH CHECK ((("assigned_to" = "auth"."uid"()) AND ("department_id" IN ( SELECT "m"."department_id"
   FROM "public"."department_members" "m"
  WHERE ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "Team members notify colleagues" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (NOT "public"."has_role"("user_id", 'client'::"public"."app_role"))));



CREATE POLICY "Team members notify project clients" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."client_id" = "notifications"."user_id") AND "public"."can_view_job"("auth"."uid"(), "j"."id"))))));



CREATE POLICY "Team members read departments" ON "public"."departments" FOR SELECT TO "authenticated" USING ((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")));



CREATE POLICY "Team members read memberships" ON "public"."department_members" FOR SELECT TO "authenticated" USING ((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")));



CREATE POLICY "Team members read project notes" ON "public"."job_comments" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Team members read team permissions" ON "public"."department_permissions" FOR SELECT TO "authenticated" USING ((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")));



CREATE POLICY "Team members view project files" ON "public"."job_attachments" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Team members view project tasks" ON "public"."job_tasks" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Team members view task notes" ON "public"."job_task_notes" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."job_tasks" "t"
  WHERE (("t"."id" = "job_task_notes"."task_id") AND "public"."can_view_job"("auth"."uid"(), "t"."job_id"))))));



CREATE POLICY "Team members view their projects" ON "public"."jobs" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_view_job"("auth"."uid"(), "id")));



CREATE POLICY "Team reads handoffs" ON "public"."task_handoffs" FOR SELECT TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Team reads project events" ON "public"."project_events" FOR SELECT TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Team reads project quotes" ON "public"."project_quotes" FOR SELECT TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Team reads shipments" ON "public"."shipments" FOR SELECT TO "authenticated" USING (((NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND ("public"."has_permission"("auth"."uid"(), 'shipping'::"text") OR "public"."can_view_job"("auth"."uid"(), "job_id"))));



CREATE POLICY "Team reads time" ON "public"."time_entries" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_permission"("auth"."uid"(), 'planning'::"text") OR "public"."has_permission"("auth"."uid"(), 'reports'::"text")));



CREATE POLICY "Team sees parts on their projects" ON "public"."inventory_transactions" FOR SELECT TO "authenticated" USING ((("job_id" IS NOT NULL) AND (NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role")) AND "public"."can_view_job"("auth"."uid"(), "job_id")));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own trusted devices" ON "public"."mfa_trusted_devices" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can submit bug reports" ON "public"."bug_reports" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK ((("auth"."uid"() = "id") AND ("is_super_admin" = ( SELECT "p"."is_super_admin"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"()))) AND ("is_active" = ( SELECT "p"."is_active"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))));



CREATE POLICY "Users can view own backup codes" ON "public"."mfa_backup_codes" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own bug reports" ON "public"."bug_reports" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own role" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own trusted devices" ON "public"."mfa_trusted_devices" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users create their own dashboard prefs" ON "public"."dashboard_prefs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their own dashboard prefs" ON "public"."dashboard_prefs" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own dismissed_broadcasts" ON "public"."dismissed_broadcasts" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own dismissed_notices" ON "public"."dismissed_notices" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage own subs" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage their own push subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own or global notices" ON "public"."system_notices" FOR SELECT TO "authenticated" USING ((("user_id" IS NULL) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Users read their own dashboard prefs" ON "public"."dashboard_prefs" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their own dashboard prefs" ON "public"."dashboard_prefs" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users view own rate limits" ON "public"."mfa_rate_limits" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Workflow staff update projects" ON "public"."jobs" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_run_job"("auth"."uid"()))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND "public"."can_run_job"("auth"."uid"())));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_onboarding_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins managers manage job tasks" ON "public"."job_tasks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'manager'::"public"."app_role"]))))));



CREATE POLICY "admins only" ON "public"."workshop_settings" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bug_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_prefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."department_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."department_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dismissed_broadcasts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dismissed_notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_admin_manager" ON "public"."monthly_revenue_goals" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['admin'::"public"."app_role", 'manager'::"public"."app_role"]))))));



CREATE POLICY "insert_job_comments" ON "public"."job_comments" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("source" = 'comment'::"text") AND (("is_internal" AND (NOT "public"."has_role"("auth"."uid"(), 'client'::"public"."app_role"))) OR ((NOT "is_internal") AND "public"."is_feature_enabled"('job_chat'::"text"))) AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_comments"."job_id") AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") OR ("j"."client_id" = "auth"."uid"())))))));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_pdf_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_task_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."labour_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mfa_backup_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mfa_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mfa_trusted_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_revenue_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_quote_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_ref_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."request_quote_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_admin_manager" ON "public"."monthly_revenue_goals" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role")));



CREATE POLICY "select_job_comments" ON "public"."job_comments" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'staff'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_comments"."job_id") AND ("j"."assigned_staff_id" = "auth"."uid"()))))) OR ((NOT "is_internal") AND (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "job_comments"."job_id") AND ("j"."client_id" = "auth"."uid"())))))));



ALTER TABLE "public"."shipments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."signup_codes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff update their own tasks" ON "public"."job_tasks" FOR UPDATE TO "authenticated" USING (("assigned_to" = "auth"."uid"())) WITH CHECK (("assigned_to" = "auth"."uid"()));



ALTER TABLE "public"."stock_request_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_notices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_handoffs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workshop_admin_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workshop_settings" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_assert_references_intact"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_assert_references_intact"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_insertable_columns"("_table" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_insertable_columns"("_table" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_sync_identity"("_table" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_sync_identity"("_table" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_client_request"("_request_id" "uuid", "_assigned_staff_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_client_request"("_request_id" "uuid", "_assigned_staff_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_client_request"("_request_id" "uuid", "_assigned_staff_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_project_event"("_job_id" "uuid", "_kind" "text", "_data" "jsonb", "_client_visible" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_project_event"("_job_id" "uuid", "_kind" "text", "_data" "jsonb", "_client_visible" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_onboarding_progress_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_onboarding_progress_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_onboarding_progress_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_user_role"("_caller_user_id" "uuid", "_target_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_user_role"("_caller_user_id" "uuid", "_target_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_approve_purchase"("_user_id" "uuid", "_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_approve_purchase"("_user_id" "uuid", "_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_approve_purchase"("_user_id" "uuid", "_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_quote"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_quote"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_quote"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_run_job"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_run_job"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_run_job"("_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_job"("_user_id" "uuid", "_job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_job"("_user_id" "uuid", "_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_job"("_user_id" "uuid", "_job_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_job_path"("_user_id" "uuid", "_folder" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_job_path"("_user_id" "uuid", "_folder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_job_path"("_user_id" "uuid", "_folder" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."choose_handover"("_job_id" "uuid", "_method" "text", "_preferred_date" "date", "_address" "text", "_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."choose_handover"("_job_id" "uuid", "_method" "text", "_preferred_date" "date", "_address" "text", "_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."choose_handover"("_job_id" "uuid", "_method" "text", "_preferred_date" "date", "_address" "text", "_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."client_decide_quote"("_request_id" "uuid", "_approve" boolean, "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_decide_quote"("_request_id" "uuid", "_approve" boolean, "_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_decide_quote"("_request_id" "uuid", "_approve" boolean, "_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."client_mark_invoice_paid"("_invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."client_mark_invoice_paid"("_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_mark_invoice_paid"("_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_invoice_on_job_completed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_invoice_on_job_completed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_project"("_p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_project"("_p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_project"("_p" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_project_quote"("_quote_id" "uuid", "_accept" boolean, "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_project_quote"("_quote_id" "uuid", "_accept" boolean, "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_project_quote"("_quote_id" "uuid", "_accept" boolean, "_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_purchase_order"("_po_id" "uuid", "_approve" boolean, "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_purchase_order"("_po_id" "uuid", "_approve" boolean, "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_purchase_order"("_po_id" "uuid", "_approve" boolean, "_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_client_request"("_request_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_client_request"("_request_id" "uuid", "_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_client_request"("_request_id" "uuid", "_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."export_workshop_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_workshop_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_job_completion_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_job_completion_stats"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_job_completion_stats"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_monthly_bookings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_monthly_bookings"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_monthly_bookings"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_monthly_revenue"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_monthly_revenue"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_monthly_revenue"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_my_basic_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_basic_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_basic_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."goal_summary"("_from" timestamp with time zone, "_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."goal_summary"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."goal_summary"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handoff_task"("_task_id" "uuid", "_note" "text", "_hours" numeric, "_next_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handoff_task"("_task_id" "uuid", "_note" "text", "_hours" numeric, "_next_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handoff_task"("_task_id" "uuid", "_note" "text", "_hours" numeric, "_next_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_feature_enabled"("feature_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("feature_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_feature_enabled"("feature_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_storekeeper"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_storekeeper"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_storekeeper"("_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_parts"("_request_item_id" "uuid", "_quantity" numeric, "_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_parts"("_request_item_id" "uuid", "_quantity" numeric, "_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_parts"("_request_item_id" "uuid", "_quantity" numeric, "_item_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."job_attachments_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."job_attachments_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_attachments_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."job_tasks_start_project"() TO "anon";
GRANT ALL ON FUNCTION "public"."job_tasks_start_project"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."job_tasks_start_project"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jobs_assign_ref"() TO "anon";
GRANT ALL ON FUNCTION "public"."jobs_assign_ref"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jobs_assign_ref"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jobs_open_shipment"() TO "anon";
GRANT ALL ON FUNCTION "public"."jobs_open_shipment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jobs_open_shipment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jobs_record_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."jobs_record_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."jobs_record_events"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_access_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_access_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_access_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_purchase_ordered"("_po_id" "uuid", "_expected" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_purchase_ordered"("_po_id" "uuid", "_expected" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_purchase_ordered"("_po_id" "uuid", "_expected" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_shipped"("_job_id" "uuid", "_d" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_shipped"("_job_id" "uuid", "_d" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_shipped"("_job_id" "uuid", "_d" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_permissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_permissions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_project_ref"("_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_project_ref"("_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_ready_to_ship"("_job_id" "uuid", "_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_ready_to_ship"("_job_id" "uuid", "_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_ready_to_ship"("_job_id" "uuid", "_message" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_users"("_users" "uuid"[], "_title" "text", "_message" "text", "_link" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_users"("_users" "uuid"[], "_title" "text", "_message" "text", "_link" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."permission_holders"("_permission" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."permission_holders"("_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."permission_keys"() TO "anon";
GRANT ALL ON FUNCTION "public"."permission_keys"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."permission_keys"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_manager_role_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_manager_role_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_manager_role_escalation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_user_roles_user_id_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_user_roles_user_id_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."project_financials"("_from" "date", "_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."project_financials"("_from" "date", "_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_financials"("_from" "date", "_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."project_quote_items_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."project_quote_items_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_quote_items_total"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."project_quote_label"("_job_id" "uuid", "_kind" "text", "_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."project_quote_label"("_job_id" "uuid", "_kind" "text", "_number" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."project_quotes_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."project_quotes_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_quotes_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."purchase_order_items_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."purchase_order_items_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purchase_order_items_total"() TO "service_role";



GRANT ALL ON FUNCTION "public"."purchase_orders_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."purchase_orders_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purchase_orders_number"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."quality_check"("_job_id" "uuid", "_pass" boolean, "_note" "text", "_rework_task_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quality_check"("_job_id" "uuid", "_pass" boolean, "_note" "text", "_rework_task_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."quality_check"("_job_id" "uuid", "_pass" boolean, "_note" "text", "_rework_task_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."receive_purchase_order"("_po_id" "uuid", "_lines" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("_po_id" "uuid", "_lines" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("_po_id" "uuid", "_lines" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reception_clients"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reception_clients"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reception_clients"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_signup_code"("_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_signup_code"("_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_stock_request"("_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_stock_request"("_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_parts"("_job_id" "uuid", "_items" "jsonb", "_notes" "text", "_needed_by" "date", "_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_parts"("_job_id" "uuid", "_items" "jsonb", "_notes" "text", "_needed_by" "date", "_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_parts"("_job_id" "uuid", "_items" "jsonb", "_notes" "text", "_needed_by" "date", "_task_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_workshop_data"("_full" boolean, "_keep_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_workshop_data"("_full" boolean, "_keep_user" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_workshop_data"("_data" "jsonb", "_caller" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_workshop_data"("_data" "jsonb", "_caller" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."return_parts"("_job_id" "uuid", "_item_id" "uuid", "_quantity" numeric, "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."return_parts"("_job_id" "uuid", "_item_id" "uuid", "_quantity" numeric, "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."return_parts"("_job_id" "uuid", "_item_id" "uuid", "_quantity" numeric, "_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_change_request"("_quote_id" "uuid", "_approve" boolean, "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_change_request"("_quote_id" "uuid", "_approve" boolean, "_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_change_request"("_quote_id" "uuid", "_approve" boolean, "_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_project_quote"("_quote_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_project_quote"("_quote_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_project_quote"("_quote_id" "uuid") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."feature_flags" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_flags" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_feature_flag"("feature_key" "text", "feature_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_feature_flag"("feature_key" "text", "feature_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_feature_flag"("feature_key" "text", "feature_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."signup_codes_set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."signup_codes_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_purchase_order"("_po_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_purchase_order"("_po_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_purchase_order"("_po_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_quote"("_request_id" "uuid", "_currency" "text", "_notes" "text", "_expires_at" timestamp with time zone, "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_quote"("_request_id" "uuid", "_currency" "text", "_notes" "text", "_expires_at" timestamp with time zone, "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_quote"("_request_id" "uuid", "_currency" "text", "_notes" "text", "_expires_at" timestamp with time zone, "_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."team_performance"("_from" timestamp with time zone, "_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."team_performance"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."team_performance"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."time_entries_sync_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."time_entries_sync_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_entries_sync_hours"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_profile_login"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_profile_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_profile_login"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."withdraw_project_quote"("_quote_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."withdraw_project_quote"("_quote_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."withdraw_project_quote"("_quote_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."workshop_data_tables"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."workshop_data_tables"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."workshop_setup_tables"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."workshop_setup_tables"() TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."admin_onboarding_progress" TO "anon";
GRANT ALL ON TABLE "public"."admin_onboarding_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_onboarding_progress" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcasts" TO "service_role";



GRANT ALL ON TABLE "public"."bug_reports" TO "anon";
GRANT ALL ON TABLE "public"."bug_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."bug_reports" TO "service_role";



GRANT ALL ON TABLE "public"."client_requests" TO "anon";
GRANT ALL ON TABLE "public"."client_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."client_requests" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_prefs" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_prefs" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_prefs" TO "service_role";



GRANT ALL ON TABLE "public"."department_members" TO "anon";
GRANT ALL ON TABLE "public"."department_members" TO "authenticated";
GRANT ALL ON TABLE "public"."department_members" TO "service_role";



GRANT ALL ON TABLE "public"."department_permissions" TO "anon";
GRANT ALL ON TABLE "public"."department_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."department_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."dismissed_broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."dismissed_broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."dismissed_broadcasts" TO "service_role";



GRANT ALL ON TABLE "public"."dismissed_notices" TO "anon";
GRANT ALL ON TABLE "public"."dismissed_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."dismissed_notices" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_pdf_versions" TO "anon";
GRANT ALL ON TABLE "public"."invoice_pdf_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_pdf_versions" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."job_attachments" TO "anon";
GRANT ALL ON TABLE "public"."job_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."job_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."job_comments" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."job_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."job_comments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."job_comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."job_comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."job_comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."job_ratings" TO "anon";
GRANT ALL ON TABLE "public"."job_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."job_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."job_task_notes" TO "anon";
GRANT ALL ON TABLE "public"."job_task_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."job_task_notes" TO "service_role";



GRANT ALL ON TABLE "public"."job_tasks" TO "anon";
GRANT ALL ON TABLE "public"."job_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."job_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."labour_rates" TO "anon";
GRANT ALL ON TABLE "public"."labour_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."labour_rates" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_backup_codes" TO "anon";
GRANT ALL ON TABLE "public"."mfa_backup_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_backup_codes" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."mfa_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_trusted_devices" TO "anon";
GRANT ALL ON TABLE "public"."mfa_trusted_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_trusted_devices" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_revenue_goals" TO "anon";
GRANT ALL ON TABLE "public"."monthly_revenue_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_revenue_goals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."monthly_revenue_goals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."monthly_revenue_goals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."monthly_revenue_goals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_events" TO "anon";
GRANT ALL ON TABLE "public"."project_events" TO "authenticated";
GRANT ALL ON TABLE "public"."project_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."project_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."project_quote_items" TO "anon";
GRANT ALL ON TABLE "public"."project_quote_items" TO "authenticated";
GRANT ALL ON TABLE "public"."project_quote_items" TO "service_role";



GRANT ALL ON TABLE "public"."project_quotes" TO "anon";
GRANT ALL ON TABLE "public"."project_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."project_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."project_ref_counters" TO "anon";
GRANT ALL ON TABLE "public"."project_ref_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."project_ref_counters" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."request_quote_items" TO "anon";
GRANT ALL ON TABLE "public"."request_quote_items" TO "authenticated";
GRANT ALL ON TABLE "public"."request_quote_items" TO "service_role";



GRANT ALL ON TABLE "public"."saved_reports" TO "anon";
GRANT ALL ON TABLE "public"."saved_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_reports" TO "service_role";



GRANT ALL ON TABLE "public"."shipments" TO "anon";
GRANT ALL ON TABLE "public"."shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."shipments" TO "service_role";



GRANT ALL ON TABLE "public"."signup_codes" TO "anon";
GRANT ALL ON TABLE "public"."signup_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_codes" TO "service_role";



GRANT ALL ON TABLE "public"."stock_request_items" TO "anon";
GRANT ALL ON TABLE "public"."stock_request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_request_items" TO "service_role";



GRANT ALL ON TABLE "public"."stock_requests" TO "anon";
GRANT ALL ON TABLE "public"."stock_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_requests" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."system_notices" TO "anon";
GRANT ALL ON TABLE "public"."system_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."system_notices" TO "service_role";



GRANT ALL ON TABLE "public"."task_handoffs" TO "anon";
GRANT ALL ON TABLE "public"."task_handoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."task_handoffs" TO "service_role";



GRANT ALL ON TABLE "public"."time_entries" TO "anon";
GRANT ALL ON TABLE "public"."time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."time_entries" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."workshop_admin_contacts" TO "anon";
GRANT ALL ON TABLE "public"."workshop_admin_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."workshop_admin_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."workshop_settings" TO "anon";
GRANT ALL ON TABLE "public"."workshop_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."workshop_settings" TO "service_role";



GRANT ALL ON TABLE "public"."workshop_settings_public" TO "anon";
GRANT ALL ON TABLE "public"."workshop_settings_public" TO "authenticated";
GRANT ALL ON TABLE "public"."workshop_settings_public" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







