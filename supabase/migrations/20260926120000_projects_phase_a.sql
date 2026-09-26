-- Projects, phase A: permanent project IDs, intake photos, separate team notes
-- from client messages, one activity timeline, a client view without internal
-- detail, and invoice discounts.
--
-- Everything here is additive, so the app currently on main keeps working:
-- job_updates stays and new rows are mirrored into team notes by a trigger.

-- ─── 1. Project IDs: EDL-202609-001 ─────────────────────────────────────────

ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS project_ref_prefix text NOT NULL DEFAULT 'EDL';

ALTER TABLE public.workshop_settings
  DROP CONSTRAINT IF EXISTS workshop_settings_project_ref_prefix_check;
ALTER TABLE public.workshop_settings
  ADD CONSTRAINT workshop_settings_project_ref_prefix_check
  CHECK (project_ref_prefix ~ '^[A-Z0-9]{2,6}$');

-- One counter per month. Only reachable through next_project_ref().
CREATE TABLE IF NOT EXISTS public.project_ref_counters (
  period text PRIMARY KEY CHECK (period ~ '^[0-9]{6}$'),
  last_value integer NOT NULL DEFAULT 0
);
ALTER TABLE public.project_ref_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_project_ref(_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
REVOKE ALL ON FUNCTION public.next_project_ref(timestamptz) FROM PUBLIC, anon, authenticated;

-- The default is a placeholder: the trigger below always replaces it on insert.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ref text;

-- Backfill existing jobs in the order they were created, numbered by their own month.
DO $$
DECLARE
  _job record;
BEGIN
  FOR _job IN SELECT id, created_at FROM public.jobs WHERE ref IS NULL ORDER BY created_at, id LOOP
    UPDATE public.jobs SET ref = public.next_project_ref(_job.created_at) WHERE id = _job.id;
  END LOOP;
END;
$$;

ALTER TABLE public.jobs ALTER COLUMN ref SET NOT NULL;
ALTER TABLE public.jobs ALTER COLUMN ref SET DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS jobs_ref_key ON public.jobs (ref);

-- The ID is assigned on insert and can never change afterwards.
CREATE OR REPLACE FUNCTION public.jobs_assign_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS jobs_assign_ref ON public.jobs;
CREATE TRIGGER jobs_assign_ref
  BEFORE INSERT OR UPDATE OF ref ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_assign_ref();

-- ─── 2. Attachment kinds ─────────────────────────────────────────────────────
-- intake   condition photos taken at reception (client can see, only admins change)
-- work     internal work files and photos (team only)
-- shared   a work file the team chose to share with the client
-- handoff  photos attached when a task is handed off (team only)
-- delivery shipping documents such as the signed delivery ticket (client can see)
-- client   files the client uploaded themselves

ALTER TABLE public.job_attachments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'work';
ALTER TABLE public.job_attachments DROP CONSTRAINT IF EXISTS job_attachments_kind_check;
ALTER TABLE public.job_attachments
  ADD CONSTRAINT job_attachments_kind_check
  CHECK (kind IN ('intake', 'work', 'shared', 'handoff', 'delivery', 'client'));

-- Existing files: the client's own uploads, and project-level files the client
-- could already see before this change (so nothing disappears from their view).
UPDATE public.job_attachments a SET kind = 'client'
WHERE kind = 'work' AND public.has_role(a.uploaded_by, 'client'::public.app_role);
UPDATE public.job_attachments SET kind = 'shared'
WHERE kind = 'work' AND task_id IS NULL;

CREATE OR REPLACE FUNCTION public.job_attachments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS job_attachments_guard ON public.job_attachments;
CREATE TRIGGER job_attachments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.job_attachments
  FOR EACH ROW EXECUTE FUNCTION public.job_attachments_guard();

-- Clients see project-level files meant for them, never task files or work-in-progress photos.
DROP POLICY IF EXISTS "Clients view job attachments" ON public.job_attachments;
CREATE POLICY "Clients view job attachments" ON public.job_attachments
  FOR SELECT USING (
    task_id IS NULL
    AND kind IN ('intake', 'shared', 'delivery', 'client')
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_attachments.job_id AND j.client_id = auth.uid())
  );

-- Storage follows the same rule: a client can only open files the table lets them see.
DROP POLICY IF EXISTS "Users can read own job attachments" ON storage.objects;
CREATE POLICY "Users can read own job attachments" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'job-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.jobs
        WHERE jobs.id::text = (storage.foldername(objects.name))[1] AND jobs.assigned_staff_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.job_attachments a
        JOIN public.jobs j ON j.id = a.job_id
        WHERE a.file_path = objects.name
          AND j.client_id = auth.uid()
          AND a.task_id IS NULL
          AND a.kind IN ('intake', 'shared', 'delivery', 'client')
      )
    )
  );

-- ─── 3. Clients get an overview, not the workshop's internal detail ─────────

DROP POLICY IF EXISTS "Clients can view own job tasks" ON public.job_tasks;
DROP POLICY IF EXISTS "Clients view task notes" ON public.job_task_notes;
DROP POLICY IF EXISTS "Clients can view updates for own jobs" ON public.job_updates;

-- ─── 4. Team notes and client messages ──────────────────────────────────────

-- Where a note came from: typed in the conversation, or carried over from the old Updates box.
ALTER TABLE public.job_comments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'comment';
ALTER TABLE public.job_comments DROP CONSTRAINT IF EXISTS job_comments_source_check;
ALTER TABLE public.job_comments ADD CONSTRAINT job_comments_source_check CHECK (source IN ('comment', 'update'));
ALTER TABLE public.job_comments ADD COLUMN IF NOT EXISTS legacy_update_id uuid UNIQUE;

-- Team notes no longer depend on the job_chat flag; only client messages do.
DROP POLICY IF EXISTS "insert_job_comments" ON public.job_comments;
CREATE POLICY "insert_job_comments" ON public.job_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND source = 'comment'
    AND (
      (is_internal AND NOT public.has_role(auth.uid(), 'client'::public.app_role))
      OR (NOT is_internal AND public.is_feature_enabled('job_chat'))
    )
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_comments.job_id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'manager'::public.app_role)
          OR public.has_role(auth.uid(), 'staff'::public.app_role)
          OR j.client_id = auth.uid()
        )
    )
  );

-- The old Updates box: carry every existing update over as a team note (never client-visible)…
CREATE OR REPLACE FUNCTION public.job_update_to_note(_update_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _u public.job_updates;
  _body text;
BEGIN
  SELECT * INTO _u FROM public.job_updates WHERE id = _update_id;
  IF NOT FOUND THEN RETURN; END IF;
  _body := trim(both from concat_ws(E'\n',
    CASE WHEN _u.status IS NOT NULL THEN 'Status → ' || replace(_u.status, '_', ' ') END,
    NULLIF(trim(both from COALESCE(_u.notes, '')), '')
  ));
  IF _body IS NULL OR _body = '' THEN RETURN; END IF;
  INSERT INTO public.job_comments (job_id, user_id, body, is_internal, source, legacy_update_id, created_at)
  VALUES (_u.job_id, _u.user_id, left(_body, 2000), true, 'update', _u.id, _u.created_at)
  ON CONFLICT (legacy_update_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.job_update_to_note(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.job_updates ORDER BY created_at LOOP
    PERFORM public.job_update_to_note(_id);
  END LOOP;
END;
$$;

-- …and keep mirroring updates the older app version still writes, until it's retired.
CREATE OR REPLACE FUNCTION public.job_updates_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.job_update_to_note(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_updates_mirror ON public.job_updates;
CREATE TRIGGER job_updates_mirror
  AFTER INSERT ON public.job_updates
  FOR EACH ROW EXECUTE FUNCTION public.job_updates_mirror();

-- ─── 5. One activity timeline per project ───────────────────────────────────
-- Written only by triggers and functions. client_visible marks the milestones
-- a client may see (the stage changes), everything else is team-only.

CREATE TABLE IF NOT EXISTS public.project_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  actor_id uuid,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_events_job_idx ON public.project_events (job_id, created_at);
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads project events" ON public.project_events;
CREATE POLICY "Team reads project events" ON public.project_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR (public.has_role(auth.uid(), 'staff'::public.app_role)
        AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = project_events.job_id AND j.assigned_staff_id = auth.uid()))
  );
DROP POLICY IF EXISTS "Clients read their milestones" ON public.project_events;
CREATE POLICY "Clients read their milestones" ON public.project_events
  FOR SELECT TO authenticated USING (
    client_visible
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = project_events.job_id AND j.client_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.add_project_event(_job_id uuid, _kind text, _data jsonb DEFAULT '{}'::jsonb, _client_visible boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid;
BEGIN
  BEGIN _actor := auth.uid(); EXCEPTION WHEN OTHERS THEN _actor := NULL; END;
  INSERT INTO public.project_events (job_id, kind, actor_id, data, client_visible)
  VALUES (_job_id, _kind, _actor, COALESCE(_data, '{}'::jsonb), _client_visible);
END;
$$;
REVOKE ALL ON FUNCTION public.add_project_event(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.jobs_record_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS jobs_record_events ON public.jobs;
CREATE TRIGGER jobs_record_events
  AFTER INSERT OR UPDATE OF status, assigned_staff_id ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_record_events();

-- History so far: creation, then status and assignment changes from the activity log.
INSERT INTO public.project_events (job_id, kind, actor_id, data, client_visible, created_at)
SELECT j.id, 'created', NULL, '{}'::jsonb, true, j.created_at
FROM public.jobs j
WHERE NOT EXISTS (SELECT 1 FROM public.project_events e WHERE e.job_id = j.id AND e.kind = 'created');

INSERT INTO public.project_events (job_id, kind, actor_id, data, client_visible, created_at)
SELECT j.id, 'status', l.user_id,
       jsonb_build_object('from', split_part(l.details->>'status_change', ' → ', 1), 'to', split_part(l.details->>'status_change', ' → ', 2)),
       true, l.created_at
FROM public.activity_logs l
JOIN public.jobs j ON j.id::text = l.record_id
WHERE l.table_name = 'jobs' AND l.details ? 'status_change'
  AND NOT EXISTS (SELECT 1 FROM public.project_events e WHERE e.job_id = j.id AND e.kind = 'status');

INSERT INTO public.project_events (job_id, kind, actor_id, data, client_visible, created_at)
SELECT j.id, 'assigned', l.user_id,
       jsonb_build_object('from', NULLIF(l.details->'staff_assignment'->>'from', ''), 'to', NULLIF(l.details->'staff_assignment'->>'to', '')),
       false, l.created_at
FROM public.activity_logs l
JOIN public.jobs j ON j.id::text = l.record_id
WHERE l.table_name = 'jobs' AND l.details ? 'staff_assignment'
  AND NOT EXISTS (SELECT 1 FROM public.project_events e WHERE e.job_id = j.id AND e.kind = 'assigned');

-- ─── 6. Invoice discount: one per invoice, before tax ───────────────────────

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_discount_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_discount_check CHECK (
  (discount_type IS NULL AND discount_value = 0 AND discount_amount = 0)
  OR (discount_type = 'percent' AND discount_value > 0 AND discount_value <= 100 AND discount_amount >= 0)
  OR (discount_type = 'amount' AND discount_value > 0 AND discount_amount >= 0 AND discount_amount <= subtotal)
);
