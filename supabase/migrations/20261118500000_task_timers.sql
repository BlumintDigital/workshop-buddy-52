-- A running timer on My day.
--
-- Starting a task on My day starts a timer. Pausing, handing off or starting
-- another task stops it and logs the time worked as a time_entries row. The
-- timer lives here, not in the browser, so it survives a reload or a new phone.
-- One row per person: a person has at most one timer running.

CREATE TABLE IF NOT EXISTS public.task_timers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_timers_task_idx ON public.task_timers (task_id);
CREATE INDEX IF NOT EXISTS task_timers_job_idx ON public.task_timers (job_id);

-- People read their own timer. Every write goes through the functions below.
ALTER TABLE public.task_timers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.task_timers FROM anon, authenticated;
GRANT SELECT ON public.task_timers TO authenticated;

DROP POLICY IF EXISTS "People see their own timer" ON public.task_timers;
CREATE POLICY "People see their own timer" ON public.task_timers
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.task_timers;
CREATE POLICY "Session must have passed 2FA" ON public.task_timers AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));

-- Stops one person's timer and logs the time. Minutes are rounded to the
-- nearest whole minute; under half a minute logs nothing. A timer left running
-- logs at most 24 hours, the most one time entry can hold.
-- Returns the hours logged, or 0 when nothing was running or logged.
-- Internal: called by stop_task_timer, start_task_timer and the job_tasks trigger.
CREATE OR REPLACE FUNCTION public._stop_task_timer(_user_id uuid, _task_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t public.task_timers%ROWTYPE;
  _minutes numeric;
  _hours numeric;
BEGIN
  DELETE FROM public.task_timers
    WHERE user_id = _user_id AND (_task_id IS NULL OR task_id = _task_id)
    RETURNING * INTO _t;
  IF NOT FOUND THEN RETURN 0; END IF;

  _minutes := LEAST(round(extract(epoch FROM (now() - _t.started_at)) / 60), 24 * 60);
  IF _minutes < 1 THEN RETURN 0; END IF;
  _hours := round(_minutes / 60, 2);

  INSERT INTO public.time_entries (job_id, task_id, user_id, hours, work_date, note)
  -- The workshop's day, not UTC's: a timer started at 00:30 in summer belongs to that day.
  VALUES (_t.job_id, _t.task_id, _t.user_id, _hours, (_t.started_at AT TIME ZONE 'Europe/London')::date, 'Timer');
  RETURN _hours;
END;
$$;
REVOKE ALL ON FUNCTION public._stop_task_timer(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Start the timer on one of your own tasks. Stops any other timer you have
-- running first, and moves the task to in progress if it hasn't started.
CREATE OR REPLACE FUNCTION public.start_task_timer(_task_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _task public.job_tasks%ROWTYPE;
  _started timestamptz;
BEGIN
  PERFORM public.assert_verified_session();
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in to start a task' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _task FROM public.job_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002'; END IF;
  IF _task.assigned_to IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'You can only time your own tasks' USING ERRCODE = '42501';
  END IF;
  IF _task.status = 'completed' THEN RAISE EXCEPTION 'This task is already handed off' USING ERRCODE = '22023'; END IF;

  -- Already timing this task: keep the timer that's running.
  SELECT started_at INTO _started FROM public.task_timers WHERE user_id = _uid AND task_id = _task_id;
  IF FOUND THEN RETURN _started; END IF;

  PERFORM public._stop_task_timer(_uid);
  IF _task.status <> 'in_progress' THEN
    UPDATE public.job_tasks SET status = 'in_progress' WHERE id = _task_id;
  END IF;
  INSERT INTO public.task_timers (user_id, task_id, job_id) VALUES (_uid, _task_id, _task.job_id)
    RETURNING started_at INTO _started;
  RETURN _started;
END;
$$;
REVOKE ALL ON FUNCTION public.start_task_timer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_task_timer(uuid) TO authenticated;

-- Stop your own timer (Pause). Returns the hours logged.
CREATE OR REPLACE FUNCTION public.stop_task_timer()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_verified_session();
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to pause a task' USING ERRCODE = '42501'; END IF;
  RETURN public._stop_task_timer(auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.stop_task_timer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stop_task_timer() TO authenticated;

-- When the task in someone's hands changes, their timer stops and logs its time:
--  * the task stops being in progress (handed off on any page, or put back):
--    every timer on it stops;
--  * the task is given to someone else: the previous person's timer stops.
-- Writes time_entries only; never touches jobs.status.
CREATE OR REPLACE FUNCTION public.job_tasks_stop_timer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _u uuid;
  _left boolean := OLD.status = 'in_progress' AND NEW.status IS DISTINCT FROM 'in_progress';
BEGIN
  FOR _u IN
    SELECT user_id FROM public.task_timers
    WHERE task_id = NEW.id AND (_left OR user_id IS DISTINCT FROM NEW.assigned_to)
  LOOP
    PERFORM public._stop_task_timer(_u, NEW.id);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.job_tasks_stop_timer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_tasks_stop_timer ON public.job_tasks;
CREATE TRIGGER job_tasks_stop_timer AFTER UPDATE OF status, assigned_to ON public.job_tasks
  FOR EACH ROW WHEN (
    (OLD.status = 'in_progress' AND NEW.status IS DISTINCT FROM 'in_progress')
    OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
  )
  EXECUTE FUNCTION public.job_tasks_stop_timer();

-- No double counting at hand-off. handoff_task completes the task first (the
-- trigger above logs the running timer as a 'Timer' entry), then logs any
-- hours typed in the hand-off dialog as 'Logged at handoff'. When a timer entry
-- for the same task was written in the same transaction, the timer wins and the
-- typed hours are dropped. This holds whoever hands off: the assignee, or a
-- planner handing off someone else's running task. If the timer logged nothing
-- (under half a minute), the typed hours are kept.
CREATE OR REPLACE FUNCTION public.time_entries_skip_handoff_after_timer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.note = 'Logged at handoff' AND NEW.task_id IS NOT NULL AND EXISTS (
    -- now() is the transaction's start time, so this only matches rows written in this transaction.
    SELECT 1 FROM public.time_entries e
    WHERE e.task_id = NEW.task_id AND e.note = 'Timer' AND e.created_at = now()
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.time_entries_skip_handoff_after_timer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_entries_skip_handoff_after_timer ON public.time_entries;
CREATE TRIGGER time_entries_skip_handoff_after_timer BEFORE INSERT ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_skip_handoff_after_timer();

-- When a timer is running on a task, whoever's it is. The hand-off dialog uses
-- this to hide its hours field. Staff who can see the project only; the timer's
-- owner stays private (task_timers rows are readable only by their owner).
CREATE OR REPLACE FUNCTION public.task_timer_started(_task_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _job uuid;
BEGIN
  PERFORM public.assert_verified_session();
  SELECT job_id INTO _job FROM public.job_tasks WHERE id = _task_id;
  IF _uid IS NULL OR _job IS NULL OR public.has_role(_uid, 'client'::public.app_role) OR NOT public.can_view_job(_uid, _job) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT min(started_at) FROM public.task_timers WHERE task_id = _task_id);
END;
$$;
REVOKE ALL ON FUNCTION public.task_timer_started(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_timer_started(uuid) TO authenticated;

-- request_parts, unchanged from phase D (with the 2FA check added in security
-- hardening), except that a task given with the request must be on this project.
CREATE OR REPLACE FUNCTION public.request_parts(_job_id uuid, _items jsonb, _notes text DEFAULT NULL, _needed_by date DEFAULT NULL, _task_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _item jsonb;
  _job public.jobs%ROWTYPE;
  _summary text;
BEGIN
  PERFORM public.assert_verified_session();
  IF _uid IS NULL OR public.has_role(_uid, 'client'::public.app_role) OR NOT public.can_view_job(_uid, _job_id) THEN
    RAISE EXCEPTION 'You can''t request parts for this project' USING ERRCODE = '42501';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Add at least one part' USING ERRCODE = '22023'; END IF;
  IF _task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.job_tasks WHERE id = _task_id AND job_id = _job_id) THEN
    RAISE EXCEPTION 'That task isn''t on this project' USING ERRCODE = '22023';
  END IF;
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
REVOKE ALL ON FUNCTION public.request_parts(uuid, jsonb, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_parts(uuid, jsonb, text, date, uuid) TO authenticated;

-- Live updates for My day and the client home. Realtime applies each table's
-- row rules, so people only hear about rows they can already read.
-- task_timers is left out on purpose: delete events carry only the key
-- (user_id) and would reach every subscriber. My day refetches after its own
-- start and pause instead.
DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['job_tasks', 'jobs', 'project_quotes', 'invoices'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    END IF;
  END LOOP;
END $$;
