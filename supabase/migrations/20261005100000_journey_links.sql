-- Joining up the journey.
--
-- 1. An appointment can become a project only through Reception's intake, and
--    remembers which project it became.
-- 2. The client's collection or delivery choice appears in the calendar as a
--    linked appointment, kept in step with the shipment.
-- 3. Goals and team figures value finished work from the agreed quote, shared
--    across the project's tasks, instead of a value typed on each task.

-- ─── 1. Appointments linked to projects ─────────────────────────────────────

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_job_id_idx ON public.appointments(job_id);

-- Called by the intake form right after create_project when the project came
-- from an appointment.
CREATE OR REPLACE FUNCTION public.link_appointment_to_project(_appointment_id uuid, _job_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'reception') THEN
    RAISE EXCEPTION 'You can''t log new projects' USING ERRCODE = '42501';
  END IF;
  UPDATE public.appointments
    SET job_id = _job_id, status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END, updated_at = now()
    WHERE id = _appointment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.link_appointment_to_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_appointment_to_project(uuid, uuid) TO authenticated;

-- ─── 2. Handover appointments follow the shipment ──────────────────────────

CREATE OR REPLACE FUNCTION public.sync_handover_appointment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job public.jobs%ROWTYPE;
  _type text := CASE WHEN NEW.method = 'courier' THEN 'delivery' ELSE 'pickup' END;
  _appt uuid;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = NEW.job_id;
  -- Appointments belong to a client account; walk-ins are handled in Shipping only.
  IF _job.client_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO _appt FROM public.appointments
    WHERE job_id = NEW.job_id AND type IN ('pickup', 'delivery') AND status <> 'cancelled'
    ORDER BY created_at DESC LIMIT 1;

  IF NEW.status = 'shipped' THEN
    UPDATE public.appointments SET status = 'completed', updated_at = now() WHERE id = _appt;
  ELSIF NEW.status = 'scheduled' AND NEW.preferred_date IS NOT NULL AND NEW.method IS NOT NULL THEN
    IF _appt IS NULL THEN
      INSERT INTO public.appointments (client_id, job_id, title, description, appointment_date, appointment_time, duration_minutes, type, status)
      VALUES (_job.client_id, NEW.job_id,
              CASE WHEN _type = 'pickup' THEN 'Collection: ' ELSE 'Delivery: ' END || COALESCE(_job.ref || ' ', '') || _job.title,
              CASE WHEN _type = 'pickup' THEN 'Client collecting' || COALESCE(' · ' || NEW.client_notes, '') ELSE NEW.delivery_address END,
              NEW.preferred_date, '09:00', 30, _type, 'confirmed');
    ELSE
      UPDATE public.appointments
        SET appointment_date = NEW.preferred_date, type = _type,
            title = CASE WHEN _type = 'pickup' THEN 'Collection: ' ELSE 'Delivery: ' END || COALESCE(_job.ref || ' ', '') || _job.title,
            description = CASE WHEN _type = 'pickup' THEN 'Client collecting' || COALESCE(' · ' || NEW.client_notes, '') ELSE NEW.delivery_address END,
            updated_at = now()
        WHERE id = _appt;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipments_sync_handover_appointment ON public.shipments;
CREATE TRIGGER shipments_sync_handover_appointment
  AFTER INSERT OR UPDATE OF status, method, preferred_date, delivery_address ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.sync_handover_appointment();

-- ─── 3. Task value from the agreed quote ───────────────────────────────────

-- What a finished task was worth: its share of the project's agreed price
-- (accepted quote plus accepted changes), weighted by estimated hours when
-- every task has an estimate, otherwise split evenly. Rework tasks carry no
-- extra value. Projects with no accepted quote keep any value typed on the task.
CREATE OR REPLACE FUNCTION public.task_share_value(_task_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (SELECT * FROM public.job_tasks WHERE id = _task_id),
  agreed AS (
    SELECT COALESCE(sum(q.subtotal), 0) AS total
    FROM public.project_quotes q, t WHERE q.job_id = t.job_id AND q.status = 'accepted'
  ),
  siblings AS (
    SELECT count(*) AS n, sum(COALESCE(s.estimated_hours, 0)) AS hours, bool_and(COALESCE(s.estimated_hours, 0) > 0) AS all_estimated
    FROM public.job_tasks s, t WHERE s.job_id = t.job_id AND s.rework_of IS NULL
  )
  SELECT CASE
    WHEN t.rework_of IS NOT NULL THEN 0
    WHEN agreed.total <= 0 THEN COALESCE(t.value, 0)
    WHEN siblings.all_estimated AND siblings.hours > 0 THEN round(agreed.total * t.estimated_hours / siblings.hours, 2)
    ELSE round(agreed.total / GREATEST(siblings.n, 1), 2)
  END
  FROM t, agreed, siblings
$$;
REVOKE ALL ON FUNCTION public.task_share_value(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_share_value(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.team_performance(_from timestamptz, _to timestamptz)
RETURNS TABLE (user_id uuid, full_name text, role text, hours numeric, handoffs bigint, task_value numeric, projects bigint, labour_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
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
    SELECT COALESCE(t.completed_by, t.assigned_to) AS user_id, sum(public.task_share_value(t.id)) AS v
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
REVOKE ALL ON FUNCTION public.team_performance(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_performance(timestamptz, timestamptz) TO authenticated;
