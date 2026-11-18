-- Timers pause themselves at closing time.
--
-- A timer left running overnight used to log every hour until someone pressed
-- Pause (up to 24 hours). Now, when the workshop has a closing time, any timer
-- still running after it is paused for the person and logs its time only up to
-- closing. The entry's note says so, and My day tells the person the next time
-- they open it. NULL closing time = off (the old behaviour).
--
-- Every 15 minutes pg_cron calls auto_pause_task_timers(). The cut-off is the
-- first closing time after the timer started (Europe/London, like the timer's
-- work date), so a late start (after closing) runs until the next day's close,
-- and a job that fires late still logs only up to closing.

ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS timer_closing_time time DEFAULT '18:00';

-- Same as before, plus when to stop counting and the note to write.
DROP FUNCTION IF EXISTS public._stop_task_timer(uuid, uuid);
CREATE OR REPLACE FUNCTION public._stop_task_timer(
  _user_id uuid,
  _task_id uuid DEFAULT NULL,
  _until timestamptz DEFAULT NULL,
  _note text DEFAULT 'Timer'
)
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

  _minutes := LEAST(round(extract(epoch FROM (LEAST(COALESCE(_until, now()), now()) - _t.started_at)) / 60), 24 * 60);
  IF _minutes < 1 THEN RETURN 0; END IF;
  _hours := round(_minutes / 60, 2);

  INSERT INTO public.time_entries (job_id, task_id, user_id, hours, work_date, note)
  -- The workshop's day, not UTC's: a timer started at 00:30 in summer belongs to that day.
  VALUES (_t.job_id, _t.task_id, _t.user_id, _hours, (_t.started_at AT TIME ZONE 'Europe/London')::date, _note);
  RETURN _hours;
END;
$$;
REVOKE ALL ON FUNCTION public._stop_task_timer(uuid, uuid, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- When a timer started at _started must stop, given the closing time (NULL: never).
CREATE OR REPLACE FUNCTION public.timer_closing_cutoff(_started timestamptz, _close time)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _close IS NULL THEN NULL ELSE (
    (CASE WHEN ((_started AT TIME ZONE 'Europe/London')::date + _close) > (_started AT TIME ZONE 'Europe/London')
          THEN (_started AT TIME ZONE 'Europe/London')::date + _close
          ELSE (_started AT TIME ZONE 'Europe/London')::date + 1 + _close END) AT TIME ZONE 'Europe/London'
  ) END;
$$;
REVOKE ALL ON FUNCTION public.timer_closing_cutoff(timestamptz, time) FROM PUBLIC, anon, authenticated;

-- Pauses every timer that has run past closing time. Returns how many it paused.
CREATE OR REPLACE FUNCTION public.auto_pause_task_timers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _close time := (SELECT timer_closing_time FROM public.workshop_settings WHERE id = 1);
  _t record;
  _n integer := 0;
BEGIN
  IF _close IS NULL THEN RETURN 0; END IF;
  FOR _t IN
    SELECT user_id, task_id, public.timer_closing_cutoff(started_at, _close) AS cutoff
    FROM public.task_timers
    WHERE public.timer_closing_cutoff(started_at, _close) <= now()
  LOOP
    PERFORM public._stop_task_timer(_t.user_id, _t.task_id, _t.cutoff, 'Timer (paused at closing time)');
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_pause_task_timers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_pause_task_timers() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shoplane-timer-closing-time') THEN
    PERFORM cron.unschedule('shoplane-timer-closing-time');
  END IF;
  PERFORM cron.schedule('shoplane-timer-closing-time', '*/15 * * * *', 'SELECT public.auto_pause_task_timers()');
END $$;
