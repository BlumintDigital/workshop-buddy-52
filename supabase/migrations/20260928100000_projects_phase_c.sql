-- Projects, phase C: one project from reception to shipping.
-- Full lifecycle statuses, reception intake details, quotes and change
-- requests on the project, the quality check, and client requests that are
-- already quoted or approved carried over into projects.
--
-- Additive for the app on main: old request RPCs keep working; the new
-- statuses show as plain text there.

-- ─── 1. Lifecycle statuses ──────────────────────────────────────────────────
-- received    logged, not yet routed
-- evaluation  being assessed, or a quote is being prepared
-- quote       quote sent, waiting for the client
-- pending     approved, waiting to be planned and started
-- in_progress being worked on
-- review      quality check
-- completed   passed quality check, ready to ship
-- shipped     collected or dispatched
-- cancelled

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN ('received', 'evaluation', 'quote', 'pending', 'in_progress', 'review', 'completed', 'shipped', 'cancelled')
);

-- ─── 2. Reception intake ────────────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS intake_type text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS make_model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS accessories text,
  ADD COLUMN IF NOT EXISTS condition_notes text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_intake_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_intake_type_check CHECK (intake_type IN ('evaluation', 'quote', 'approved'));

UPDATE public.jobs SET received_at = created_at WHERE received_at IS NULL;
UPDATE public.jobs SET intake_type = 'quote' WHERE status = 'quote' AND intake_type = 'approved';
ALTER TABLE public.jobs ALTER COLUMN received_at SET DEFAULT now();

-- Who can run the front of house: reception and planners (admins and managers always).
CREATE OR REPLACE FUNCTION public.can_quote(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_permission(_user_id, 'reception') OR public.has_permission(_user_id, 'planning');
$$;

-- ─── 3. Quotes and change requests ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('quote', 'change')),
  number integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
  reason text CHECK (reason IS NULL OR length(reason) <= 2000),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  currency text,
  subtotal numeric NOT NULL DEFAULT 0,
  schedule_impact_days integer CHECK (schedule_impact_days IS NULL OR schedule_impact_days BETWEEN -365 AND 365),
  valid_until date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'sent', 'accepted', 'declined', 'withdrawn')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  sent_at timestamptz,
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_note text CHECK (decision_note IS NULL OR length(decision_note) <= 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS project_quotes_number_key ON public.project_quotes (job_id, kind, number);
CREATE INDEX IF NOT EXISTS project_quotes_job_idx ON public.project_quotes (job_id);
CREATE INDEX IF NOT EXISTS project_quotes_status_idx ON public.project_quotes (status);
ALTER TABLE public.project_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.project_quotes(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 500),
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS project_quote_items_quote_idx ON public.project_quote_items (quote_id, position);
ALTER TABLE public.project_quote_items ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS project_quotes_set_updated_at ON public.project_quotes;
CREATE TRIGGER project_quotes_set_updated_at BEFORE UPDATE ON public.project_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Q1, Q2… and CR1, CR2… per project.
CREATE OR REPLACE FUNCTION public.project_quotes_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('project_quotes:' || NEW.job_id::text || NEW.kind));
    SELECT COALESCE(max(number), 0) + 1 INTO NEW.number FROM public.project_quotes WHERE job_id = NEW.job_id AND kind = NEW.kind;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS project_quotes_number ON public.project_quotes;
CREATE TRIGGER project_quotes_number BEFORE INSERT ON public.project_quotes
  FOR EACH ROW EXECUTE FUNCTION public.project_quotes_number();

-- The subtotal always matches the lines.
CREATE OR REPLACE FUNCTION public.project_quote_items_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
DROP TRIGGER IF EXISTS project_quote_items_total ON public.project_quote_items;
CREATE TRIGGER project_quote_items_total AFTER INSERT OR UPDATE OR DELETE ON public.project_quote_items
  FOR EACH ROW EXECUTE FUNCTION public.project_quote_items_total();

-- Quote label for messages: EDL-202609-001-Q1 / EDL-202609-001-CR1.
CREATE OR REPLACE FUNCTION public.project_quote_label(_job_id uuid, _kind text, _number integer)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT j.ref || '-' || CASE WHEN _kind = 'quote' THEN 'Q' ELSE 'CR' END || _number
  FROM public.jobs j WHERE j.id = _job_id;
$$;
REVOKE ALL ON FUNCTION public.project_quote_label(uuid, text, integer) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Team reads project quotes" ON public.project_quotes;
CREATE POLICY "Team reads project quotes" ON public.project_quotes
  FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(), 'client'::public.app_role) AND public.can_view_job(auth.uid(), job_id));
DROP POLICY IF EXISTS "Clients read their quotes" ON public.project_quotes;
CREATE POLICY "Clients read their quotes" ON public.project_quotes
  FOR SELECT TO authenticated USING (
    status IN ('sent', 'accepted', 'declined')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = project_quotes.job_id AND j.client_id = auth.uid())
  );
-- Drafts are edited directly; every status change goes through the functions below.
DROP POLICY IF EXISTS "Front of house drafts quotes" ON public.project_quotes;
CREATE POLICY "Front of house drafts quotes" ON public.project_quotes
  FOR INSERT TO authenticated WITH CHECK (public.can_quote(auth.uid()) AND status = 'draft' AND public.can_view_job(auth.uid(), job_id));
DROP POLICY IF EXISTS "Front of house edits drafts" ON public.project_quotes;
CREATE POLICY "Front of house edits drafts" ON public.project_quotes
  FOR UPDATE TO authenticated USING (public.can_quote(auth.uid()) AND status = 'draft') WITH CHECK (status = 'draft');
DROP POLICY IF EXISTS "Front of house deletes drafts" ON public.project_quotes;
CREATE POLICY "Front of house deletes drafts" ON public.project_quotes
  FOR DELETE TO authenticated USING (public.can_quote(auth.uid()) AND status = 'draft');

DROP POLICY IF EXISTS "Read quote lines with their quote" ON public.project_quote_items;
CREATE POLICY "Read quote lines with their quote" ON public.project_quote_items
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.project_quotes q WHERE q.id = project_quote_items.quote_id));
DROP POLICY IF EXISTS "Edit lines of draft quotes" ON public.project_quote_items;
CREATE POLICY "Edit lines of draft quotes" ON public.project_quote_items
  FOR ALL TO authenticated
  USING (public.can_quote(auth.uid()) AND EXISTS (SELECT 1 FROM public.project_quotes q WHERE q.id = project_quote_items.quote_id AND q.status = 'draft'))
  WITH CHECK (public.can_quote(auth.uid()) AND EXISTS (SELECT 1 FROM public.project_quotes q WHERE q.id = project_quote_items.quote_id AND q.status = 'draft'));

-- Send a draft. A quote goes straight to the client; a change request needs an
-- admin's sign-off first (an admin sending one signs it off at the same time).
CREATE OR REPLACE FUNCTION public.send_project_quote(_quote_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- An admin signs off (or rejects) a change request before the client sees it.
CREATE OR REPLACE FUNCTION public.review_change_request(_quote_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- The client accepts or declines. Staff can record the decision for clients
-- without a portal account (walk-ins, phone calls).
CREATE OR REPLACE FUNCTION public.decide_project_quote(_quote_id uuid, _accept boolean, _note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.withdraw_project_quote(_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- ─── 4. Reception: log a project in one step ────────────────────────────────

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

-- Reception declines requests too (was admins and managers only).
CREATE OR REPLACE FUNCTION public.decline_client_request(_request_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Reception staff see the portal request queue.
DROP POLICY IF EXISTS "Reception reads requests" ON public.client_requests;
CREATE POLICY "Reception reads requests" ON public.client_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.has_permission(auth.uid(), 'reception'));

-- Clients reception can log work for. Staff can't read profiles directly.
CREATE OR REPLACE FUNCTION public.reception_clients()
RETURNS TABLE (id uuid, full_name text, company_name text, phone text, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.company_name, p.phone, u.email::text
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'client'
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE public.has_permission(auth.uid(), 'reception') AND p.is_active
  ORDER BY COALESCE(NULLIF(p.company_name, ''), p.full_name);
$$;
REVOKE ALL ON FUNCTION public.reception_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reception_clients() TO authenticated;

-- Starting the first task starts the project.
CREATE OR REPLACE FUNCTION public.job_tasks_start_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    UPDATE public.jobs SET status = 'in_progress' WHERE id = NEW.job_id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_tasks_start_project ON public.job_tasks;
CREATE TRIGGER job_tasks_start_project AFTER UPDATE OF status ON public.job_tasks
  FOR EACH ROW EXECUTE FUNCTION public.job_tasks_start_project();

-- ─── 5. Quality check ───────────────────────────────────────────────────────
-- Pass: the project is ready to ship. Send back: chosen tasks get a rework
-- task for the same team and person, and the project returns to work.

CREATE OR REPLACE FUNCTION public.quality_check(_job_id uuid, _pass boolean, _note text DEFAULT NULL, _rework_task_ids uuid[] DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- ─── 6. Draft invoice from what the client agreed ───────────────────────────
-- When a project passes its quality check, the draft invoice is filled from
-- the accepted quote and change requests instead of starting empty.

CREATE OR REPLACE FUNCTION public.create_invoice_on_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

-- ─── 7. Requests already quoted or approved become projects ─────────────────

DO $$
DECLARE
  _r public.client_requests%ROWTYPE;
  _job uuid;
  _quote uuid;
BEGIN
  FOR _r IN SELECT * FROM public.client_requests WHERE status IN ('quoted', 'approved') AND converted_job_id IS NULL ORDER BY created_at LOOP
    INSERT INTO public.jobs (title, description, priority, status, intake_type, client_id, due_date, source_request_id, created_at, received_at)
    VALUES (_r.title, _r.description, _r.priority, CASE WHEN _r.status::text = 'approved' THEN 'pending' ELSE 'quote' END, 'quote',
            _r.client_id, _r.preferred_date, _r.id, _r.created_at, _r.created_at)
    RETURNING id INTO _job;

    INSERT INTO public.project_quotes (job_id, kind, number, title, notes, currency, status, valid_until, sent_at, decided_at, created_by, created_at)
    VALUES (_job, 'quote', 1, _r.title, _r.quoted_notes, _r.quoted_currency,
            CASE WHEN _r.status::text = 'approved' THEN 'accepted' ELSE 'sent' END,
            _r.quote_expires_at::date, COALESCE(_r.reviewed_at, _r.updated_at), _r.client_decision_at, _r.reviewed_by, COALESCE(_r.reviewed_at, _r.created_at))
    RETURNING id INTO _quote;

    INSERT INTO public.project_quote_items (quote_id, description, quantity, unit_price, position)
    SELECT _quote, COALESCE(NULLIF(trim(description), ''), 'Item'), GREATEST(quantity, 0.01), GREATEST(unit_price, 0), row_number() OVER (ORDER BY created_at)
    FROM public.request_quote_items WHERE request_id = _r.id;

    UPDATE public.client_requests SET status = 'converted', converted_job_id = _job WHERE id = _r.id;
  END LOOP;
END;
$$;

-- ─── 8. Access to the new functions ─────────────────────────────────────────

REVOKE ALL ON FUNCTION public.send_project_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_project_quote(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.review_change_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_change_request(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.decide_project_quote(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_project_quote(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.withdraw_project_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_project_quote(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_project(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.quality_check(uuid, boolean, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quality_check(uuid, boolean, text, uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.can_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_quote(uuid) TO authenticated;
