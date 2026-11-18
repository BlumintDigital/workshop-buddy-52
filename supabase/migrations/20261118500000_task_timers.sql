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
  VALUES (_t.job_id, _t.task_id, _t.user_id, _hours, _t.started_at::date, 'Timer');
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

-- A task that stops being in progress (handed off on any page, or put back)
-- stops whoever's timer is running on it. Writes time_entries only; never
-- touches jobs.status.
CREATE OR REPLACE FUNCTION public.job_tasks_stop_timer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _u uuid;
BEGIN
  FOR _u IN SELECT user_id FROM public.task_timers WHERE task_id = NEW.id LOOP
    PERFORM public._stop_task_timer(_u, NEW.id);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.job_tasks_stop_timer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS job_tasks_stop_timer ON public.job_tasks;
CREATE TRIGGER job_tasks_stop_timer AFTER UPDATE OF status ON public.job_tasks
  FOR EACH ROW WHEN (OLD.status = 'in_progress' AND NEW.status IS DISTINCT FROM 'in_progress')
  EXECUTE FUNCTION public.job_tasks_stop_timer();

-- Live updates for My day and the client home. Realtime applies each table's
-- row rules, so people only hear about rows they can already read.
DO $$
DECLARE
  _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['task_timers', 'job_tasks', 'jobs', 'project_quotes', 'invoices'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = _t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
    END IF;
  END LOOP;
END $$;
