-- Stage integrity.
--
-- A project's stage (jobs.status) is stored once and changed only by the stage
-- functions below, each of which checks the current stage first. A direct
-- UPDATE of jobs.status (from the browser, an edge function or SQL) is refused
-- unless the caller is one of those functions.
--
-- CONTRACT: the stage functions mark themselves with the transaction-local
-- setting shoplane.stage_rpc = 'on'. Any later migration that changes a stage
-- (mark_shipped is being redefined by another workstream) sets the same flag:
--   PERFORM set_config('shoplane.stage_rpc', 'on', true);
--
-- Also: tasks can't be named after a stage (Quality check, Shipping and so on),
-- because those stages start by themselves when every task is handed off.

-- ============================================================ 1. Reserved task titles
-- Whole-title match after lower-casing and dropping punctuation, so "Inspect brakes"
-- or "Check shipping damage" are fine but "Shipping" or "Q.C." are not.
-- Keep in step with src/lib/taskTitles.ts.
CREATE OR REPLACE FUNCTION public.is_reserved_task_title(_title text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT trim(regexp_replace(replace(lower(COALESCE(_title, '')), '.', ''), '[^a-z0-9]+', ' ', 'g')) IN (
    'quality check', 'qc', 'final inspection',
    'shipping', 'ship', 'hand over', 'handover'
  );
$$;
REVOKE ALL ON FUNCTION public.is_reserved_task_title(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_reserved_task_title(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.job_tasks_reserved_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title) AND public.is_reserved_task_title(NEW.title) THEN
    RAISE EXCEPTION 'Quality check and shipping are stages, not tasks. They start automatically when every task is handed off.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.job_tasks_reserved_title() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS job_tasks_reserved_title ON public.job_tasks;
CREATE TRIGGER job_tasks_reserved_title BEFORE INSERT OR UPDATE OF title ON public.job_tasks
  FOR EACH ROW EXECUTE FUNCTION public.job_tasks_reserved_title();

-- ============================================================ 2. Only stage functions change the stage
CREATE OR REPLACE FUNCTION public.jobs_guard_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND COALESCE(current_setting('shoplane.stage_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'A project''s stage can only be changed with the stage buttons' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.jobs_guard_stage() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS jobs_guard_stage ON public.jobs;
CREATE TRIGGER jobs_guard_stage BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_guard_stage();

-- A new project starts at an early stage. Later stages are reached through the stage functions.
-- (Restores run with triggers off, so backups keep their stages.)
CREATE OR REPLACE FUNCTION public.jobs_guard_new_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('received', 'evaluation', 'quote', 'pending') AND COALESCE(current_setting('shoplane.stage_rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION 'A new project starts at Received, Evaluating, Quote sent or Approved' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.jobs_guard_new_stage() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS jobs_guard_new_stage ON public.jobs;
CREATE TRIGGER jobs_guard_new_stage BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_guard_new_stage();

-- Moves a project from one of _from to _to, or fails if it has moved on meanwhile.
-- Internal: called by the stage functions, never from the API.
CREATE OR REPLACE FUNCTION public.set_project_stage(_job_id uuid, _from text[], _to text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('shoplane.stage_rpc', 'on', true);
  UPDATE public.jobs SET status = _to WHERE id = _job_id AND status = ANY (_from);
  IF NOT FOUND THEN
    PERFORM set_config('shoplane.stage_rpc', 'off', true);
    RAISE EXCEPTION 'This project has moved to another stage. Refresh the page to see where it is now' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('shoplane.stage_rpc', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_project_stage(uuid, text[], text) FROM PUBLIC, anon, authenticated;

-- The project lead keeps editing their project's details; its stage is guarded above.
DROP POLICY IF EXISTS "Staff can update assigned jobs" ON public.jobs;
DROP POLICY IF EXISTS "Project lead updates their project" ON public.jobs;
CREATE POLICY "Project lead updates their project" ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND assigned_staff_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role) AND assigned_staff_id = auth.uid());

-- ============================================================ 3. Existing stage functions, now guarded
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
  PERFORM public.assert_verified_session();
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
    PERFORM public.set_project_stage(_q.job_id, ARRAY['received', 'evaluation'], 'quote');
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
  PERFORM public.assert_verified_session();
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
      PERFORM public.set_project_stage(_q.job_id, ARRAY['received', 'evaluation', 'quote'], 'pending');
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

CREATE OR REPLACE FUNCTION public.decide_quote_by_link(_token text, _accept boolean, _name text, _note text DEFAULT NULL, _ip text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _l public.quote_links%ROWTYPE;
  _q public.project_quotes%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _label text;
  _status text := CASE WHEN _accept THEN 'accepted' ELSE 'declined' END;
  _who text := left(trim(COALESCE(_name, '')), 120);
  _why text := NULLIF(left(trim(COALESCE(_note, '')), 1000), '');
BEGIN
  IF length(_who) < 2 THEN RAISE EXCEPTION 'Type your name to confirm' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _l FROM public.quote_links WHERE token_hash = encode(digest(COALESCE(_token, ''), 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR _l.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This link is no longer valid' USING ERRCODE = '42501'; END IF;
  IF _l.expires_at < now() THEN RAISE EXCEPTION 'This link has expired. Ask the workshop for a new one' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _l.quote_id FOR UPDATE;
  IF _q.status <> 'sent' THEN RAISE EXCEPTION 'This quote isn''t waiting for a decision any more' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _q.job_id FOR UPDATE;
  _label := public.project_quote_label(_q.job_id, _q.kind, _q.number);

  UPDATE public.project_quotes
    SET status = _status, decided_at = now(), decided_by = NULL,
        decision_note = left(concat_ws(' · ', 'By link: ' || _who, _why), 1200)
    WHERE id = _q.id;
  UPDATE public.quote_links SET used_at = now() WHERE id = _l.id;
  PERFORM public.add_project_event(_q.job_id, CASE WHEN _accept THEN 'quote_accepted' ELSE 'quote_declined' END,
    jsonb_build_object('label', CASE WHEN _q.kind = 'quote' THEN 'Quote ' ELSE 'Change request ' END || _label,
                       'reason', _why, 'via_link', true, 'name', _who, 'ip', left(COALESCE(_ip, ''), 64)), true);

  IF _q.kind = 'quote' AND _accept THEN
    UPDATE public.project_quotes SET status = 'withdrawn' WHERE job_id = _q.job_id AND kind = 'quote' AND id <> _q.id AND status IN ('draft', 'pending_approval', 'sent');
    IF _job.status IN ('received', 'evaluation', 'quote') THEN
      PERFORM public.set_project_stage(_q.job_id, ARRAY['received', 'evaluation', 'quote'], 'pending');
    END IF;
  END IF;

  PERFORM public.notify_users(
    ARRAY(SELECT public.permission_holders('planning')) || ARRAY[_q.created_by, _job.assigned_staff_id, _l.created_by],
    CASE WHEN _accept THEN 'Accepted by link: ' ELSE 'Declined by link: ' END || _label,
    _job.title || U&' \00B7 ' || _who || CASE WHEN _why IS NOT NULL THEN U&' \00B7 ' || left(_why, 120) ELSE '' END,
    '/projects/' || _q.job_id);
  RETURN _status;
END;
$$;

CREATE OR REPLACE FUNCTION public.handoff_task(_task_id uuid, _note text, _hours numeric DEFAULT NULL, _next_task_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.job_tasks%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _next public.job_tasks%ROWTYPE;
  _id uuid;
  _remaining int;
BEGIN
  PERFORM public.assert_verified_session();
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

  -- Lock the project before the task changes, so the stage is read once and stays put.
  SELECT * INTO _job FROM public.jobs WHERE id = _task.job_id FOR UPDATE;

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
    PERFORM public.set_project_stage(_task.job_id, ARRAY['pending', 'in_progress'], 'review');
    PERFORM public.notify_users(
      COALESCE(NULLIF(ARRAY(SELECT public.permission_holders('quality')), '{}'),
               ARRAY(SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager'))),
      'Ready for quality check: ' || _job.ref,
      'Every task on "' || _job.title || '" is handed off.',
      '/projects/' || _task.job_id);
  ELSIF _job.status = 'pending' THEN
    -- The first handoff means work has started.
    PERFORM public.set_project_stage(_task.job_id, ARRAY['pending'], 'in_progress');
  END IF;

  RETURN _id;
END;
$$;

-- Starting a task starts an approved project. Quietly does nothing at any other stage.
CREATE OR REPLACE FUNCTION public.job_tasks_start_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' THEN
    PERFORM set_config('shoplane.stage_rpc', 'on', true);
    UPDATE public.jobs SET status = 'in_progress' WHERE id = NEW.job_id AND status = 'pending';
    PERFORM set_config('shoplane.stage_rpc', 'off', true);
  END IF;
  RETURN NEW;
END;
$$;

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
  PERFORM public.assert_verified_session();
  IF NOT public.has_permission(_uid, 'quality') THEN RAISE EXCEPTION 'You can''t sign off quality' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  -- A second press of Pass after it worked changes nothing.
  IF _pass AND _job.status IN ('completed', 'shipped') THEN RETURN _job.status; END IF;
  IF _job.status <> 'review' THEN RAISE EXCEPTION 'This project isn''t waiting for a quality check' USING ERRCODE = '22023'; END IF;

  IF _pass THEN
    -- Nothing stays "To do" on a project that has passed.
    UPDATE public.job_tasks SET status = 'completed', completed_at = now() WHERE job_id = _job_id AND status <> 'completed';
    PERFORM public.set_project_stage(_job_id, ARRAY['review'], 'completed');
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
  PERFORM public.set_project_stage(_job_id, ARRAY['review'], 'in_progress');
  RETURN 'in_progress';
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_shipped(_job_id uuid, _d jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.shipments%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _method text;
  _detail text;
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.has_permission(_uid, 'shipping') THEN RAISE EXCEPTION 'Only shipping can mark items as shipped' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = 'P0002'; END IF;
  IF _s.status = 'shipped' THEN RAISE EXCEPTION 'Already shipped' USING ERRCODE = '22023'; END IF;
  _method := COALESCE(NULLIF(_d->>'method', ''), _s.method);
  IF _method = 'pickup' AND length(trim(COALESCE(_d->>'collector_name', ''))) = 0 THEN RAISE EXCEPTION 'Record who collected it' USING ERRCODE = '22023'; END IF;
  IF _method = 'courier' AND length(trim(COALESCE(_d->>'carrier', ''))) = 0 THEN RAISE EXCEPTION 'Record the courier' USING ERRCODE = '22023'; END IF;
  IF _method IS NULL THEN RAISE EXCEPTION 'Choose collection or courier' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  -- A project moved back after passing QC still has its shipment row; it must pass again first.
  IF _job.status <> 'completed' THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = '22023'; END IF;

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

  PERFORM public.set_project_stage(_job_id, ARRAY['completed'], 'shipped');
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

-- ============================================================ 4. Stage moves the browser used to make directly
-- The client agreed without a formal quote.
CREATE OR REPLACE FUNCTION public.approve_project_without_quote(_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _job public.jobs%ROWTYPE;
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.can_quote(_uid) THEN RAISE EXCEPTION 'You can''t approve projects' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF _job.status = 'pending' THEN RETURN 'pending'; END IF;
  IF _job.status NOT IN ('received', 'evaluation', 'quote') THEN
    RAISE EXCEPTION 'This project is already past approval' USING ERRCODE = '22023';
  END IF;
  PERFORM public.set_project_stage(_job_id, ARRAY['received', 'evaluation', 'quote'], 'pending');
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('planning')),
    'New project to plan: ' || _job.ref, _job.title, '/projects/' || _job_id);
  RETURN 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.approve_project_without_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_project_without_quote(uuid) TO authenticated;

-- Closes (cancels) a project. Reception and planners can close one before work is approved;
-- admins and managers at any stage before it ships.
CREATE OR REPLACE FUNCTION public.close_project(_job_id uuid, _reason text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _job public.jobs%ROWTYPE;
  _why text := NULLIF(left(trim(COALESCE(_reason, '')), 1000), '');
  _boss boolean := public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role);
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT (_boss OR public.can_quote(_uid)) THEN RAISE EXCEPTION 'You can''t close projects' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF _job.status = 'cancelled' THEN RETURN 'cancelled'; END IF;
  IF _job.status = 'shipped' THEN RAISE EXCEPTION 'A shipped project can''t be closed' USING ERRCODE = '22023'; END IF;
  IF NOT _boss AND _job.status NOT IN ('received', 'evaluation', 'quote') THEN
    RAISE EXCEPTION 'Only an admin or manager can close a project once it''s approved' USING ERRCODE = '42501';
  END IF;
  PERFORM public.set_project_stage(_job_id, ARRAY['received', 'evaluation', 'quote', 'pending', 'in_progress', 'review', 'completed'], 'cancelled');
  INSERT INTO public.job_comments (job_id, user_id, body, is_internal)
  VALUES (_job_id, _uid, 'Closed' || COALESCE(': ' || _why, ''), true);
  RETURN 'cancelled';
END;
$$;
REVOKE ALL ON FUNCTION public.close_project(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, text) TO authenticated;

-- Every task is handed off but the project didn't move on by itself.
CREATE OR REPLACE FUNCTION public.start_quality_check(_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _job public.jobs%ROWTYPE;
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.has_permission(_uid, 'quality') THEN RAISE EXCEPTION 'You can''t sign off quality' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF _job.status = 'review' THEN RETURN 'review'; END IF;
  IF _job.status <> 'in_progress' THEN RAISE EXCEPTION 'Only a project in progress can go to its quality check' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.job_tasks WHERE job_id = _job_id AND status <> 'completed') THEN
    RAISE EXCEPTION 'Hand off every task first' USING ERRCODE = '22023';
  END IF;
  PERFORM public.set_project_stage(_job_id, ARRAY['in_progress'], 'review');
  RETURN 'review';
END;
$$;
REVOKE ALL ON FUNCTION public.start_quality_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_quality_check(uuid) TO authenticated;

-- Admins and managers can move a project back a stage, or reopen a closed one at Received.
-- The reason is kept as a team note.
CREATE OR REPLACE FUNCTION public.move_project_back(_job_id uuid, _to text, _reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _job public.jobs%ROWTYPE;
  _order text[] := ARRAY['received', 'evaluation', 'quote', 'pending', 'in_progress', 'review', 'completed'];
  _labels jsonb := '{"received":"Received","evaluation":"Evaluating","quote":"Quote sent","pending":"Approved","in_progress":"In progress","review":"Quality check","completed":"Ready to ship","cancelled":"Cancelled"}';
  _why text := NULLIF(left(trim(COALESCE(_reason, '')), 1000), '');
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT (public.has_role(_uid, 'admin'::public.app_role) OR public.has_role(_uid, 'manager'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an admin or manager can move a project back' USING ERRCODE = '42501';
  END IF;
  IF _why IS NULL THEN RAISE EXCEPTION 'Say why it''s moving back' USING ERRCODE = '22023'; END IF;
  -- Only stages before shipping are targets; Cancelled goes through close_project.
  IF NOT (COALESCE(_to, '') = ANY (_order)) THEN
    RAISE EXCEPTION 'Choose an earlier stage to move the project back to' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF _job.status = _to THEN RETURN _to; END IF;
  IF _job.status = 'shipped' THEN RAISE EXCEPTION 'A shipped project can''t be moved back' USING ERRCODE = '22023'; END IF;
  IF _job.status = 'cancelled' THEN
    -- The one move out of Cancelled: reopen at the very start.
    IF _to <> 'received' THEN RAISE EXCEPTION 'A closed project can only be reopened at Received' USING ERRCODE = '22023'; END IF;
  ELSIF COALESCE(array_position(_order, _to), 0) >= COALESCE(array_position(_order, _job.status), 0) THEN
    RAISE EXCEPTION 'A project can only move back a stage here. Use the stage buttons to move it forward' USING ERRCODE = '22023';
  END IF;
  PERFORM public.set_project_stage(_job_id, ARRAY[_job.status], _to);
  INSERT INTO public.job_comments (job_id, user_id, body, is_internal)
  VALUES (_job_id, _uid, left('Moved back from ' || (_labels->>_job.status) || ' to ' || (_labels->>_to) || ': ' || _why, 2000), true);
  RETURN _to;
END;
$$;
REVOKE ALL ON FUNCTION public.move_project_back(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_project_back(uuid, text, text) TO authenticated;

-- Demo and sample data: projects at any stage, for an admin or the server (seed-data).
CREATE OR REPLACE FUNCTION public.seed_demo_projects(_rows jsonb)
RETURNS TABLE (id uuid, status text, client_id uuid, assigned_staff_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.assert_verified_session();
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Only an admin can add demo data' USING ERRCODE = '42501';
    END IF;
  ELSIF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only an admin can add demo data' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('shoplane.stage_rpc', 'on', true);
  RETURN QUERY
    WITH ins AS (
    INSERT INTO public.jobs AS j (title, description, status, priority, client_id, assigned_staff_id, estimated_hours, actual_hours, due_date)
    SELECT r.title, r.description, COALESCE(r.status, 'pending'), COALESCE(r.priority, 'medium'), r.client_id, r.assigned_staff_id,
           r.estimated_hours, r.actual_hours, r.due_date
    FROM jsonb_to_recordset(COALESCE(_rows, '[]'::jsonb)) AS r(title text, description text, status text, priority text, client_id uuid,
         assigned_staff_id uuid, estimated_hours numeric, actual_hours numeric, due_date date)
    RETURNING j.id, j.status, j.client_id, j.assigned_staff_id
    )
    SELECT ins.id, ins.status, ins.client_id, ins.assigned_staff_id FROM ins;
  PERFORM set_config('shoplane.stage_rpc', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.seed_demo_projects(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_projects(jsonb) TO authenticated, service_role;

-- ============================================================ 5. Deleting the last open task
-- Same rule as handing it off: with nothing left to do, the project goes to its quality check.
CREATE OR REPLACE FUNCTION public.job_tasks_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _job public.jobs%ROWTYPE;
BEGIN
  IF OLD.status = 'completed' THEN RETURN OLD; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = OLD.job_id AND status = 'in_progress' FOR UPDATE;
  IF NOT FOUND THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM public.job_tasks WHERE job_id = OLD.job_id AND status <> 'completed')
     OR NOT EXISTS (SELECT 1 FROM public.job_tasks WHERE job_id = OLD.job_id) THEN
    RETURN OLD;
  END IF;
  PERFORM public.set_project_stage(OLD.job_id, ARRAY['in_progress'], 'review');
  PERFORM public.notify_users(
    COALESCE(NULLIF(ARRAY(SELECT public.permission_holders('quality')), '{}'),
             ARRAY(SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'manager'))),
    'Ready for quality check: ' || _job.ref,
    'Every task on "' || _job.title || '" is handed off.',
    '/projects/' || OLD.job_id);
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.job_tasks_after_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS job_tasks_after_delete ON public.job_tasks;
CREATE TRIGGER job_tasks_after_delete AFTER DELETE ON public.job_tasks
  FOR EACH ROW EXECUTE FUNCTION public.job_tasks_after_delete();

-- ============================================================ 6. Clean up stage-named tasks already saved
-- Only on projects in progress or at QC, where they hold things up. Close them, leave a team
-- note, and send any project they were holding up to its quality check.
DO $$
DECLARE
  _r record;
BEGIN
  FOR _r IN
    SELECT t.job_id, string_agg('"' || t.title || '"', ', ' ORDER BY t.created_at) AS titles,
           COALESCE(j.assigned_staff_id, j.received_by,
                    (SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin' ORDER BY ur.user_id LIMIT 1)) AS author
    FROM public.job_tasks t JOIN public.jobs j ON j.id = t.job_id
    WHERE t.status <> 'completed' AND public.is_reserved_task_title(t.title) AND j.status IN ('in_progress', 'review')
    GROUP BY t.job_id, j.assigned_staff_id, j.received_by
  LOOP
    UPDATE public.job_tasks SET status = 'completed', completed_at = now()
      WHERE job_id = _r.job_id AND status <> 'completed' AND public.is_reserved_task_title(title);
    IF _r.author IS NOT NULL THEN
      INSERT INTO public.job_comments (job_id, user_id, body, is_internal)
      VALUES (_r.job_id, _r.author, left('Closed ' || _r.titles || ' automatically. Quality check and shipping are stages, not tasks. '
        || 'They start automatically when every task is handed off.', 2000), true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.job_tasks WHERE job_id = _r.job_id AND status <> 'completed') THEN
      PERFORM set_config('shoplane.stage_rpc', 'on', true);
      UPDATE public.jobs SET status = 'review' WHERE id = _r.job_id AND status = 'in_progress';
      PERFORM set_config('shoplane.stage_rpc', 'off', true);
    END IF;
  END LOOP;
END $$;
