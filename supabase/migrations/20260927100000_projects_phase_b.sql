-- Projects, phase B: teams (departments), per-person module permissions, tasks
-- assigned to a team and then a person, handoff records, time logging and
-- labour cost rates.
--
-- Additive: existing policies stay; new ones widen access only where a team
-- or permission says so. The app on main keeps working against this schema.

-- ─── 1. Teams ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  description text CHECK (description IS NULL OR length(description) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_key ON public.departments (lower(trim(name)));
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS departments_set_updated_at ON public.departments;
CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.department_members (
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_lead boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, user_id)
);
CREATE INDEX IF NOT EXISTS department_members_user_idx ON public.department_members (user_id);
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;

-- Tasks can belong to a team (policies below need the column to exist).
ALTER TABLE public.job_tasks
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_hours numeric CHECK (estimated_hours IS NULL OR estimated_hours >= 0),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rework_of uuid REFERENCES public.job_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS job_tasks_department_idx ON public.job_tasks (department_id);
CREATE INDEX IF NOT EXISTS job_tasks_assigned_idx ON public.job_tasks (assigned_to);

-- ─── 2. Permissions ─────────────────────────────────────────────────────────
-- reception          log machines as they arrive, accept client requests
-- planning           plan projects: split into team tasks, assign people, request parts
-- quality            run the quality check and release work to shipping
-- inventory          run the inventory portal: stock, parts requests, suppliers, purchases
-- inventory_approve  approve purchase orders (managers up to the limit in settings)
-- shipping           run the shipping portal
-- reports            reports, project costs and labour rates
-- billing            invoices

CREATE OR REPLACE FUNCTION public.permission_keys()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['reception', 'planning', 'quality', 'inventory', 'inventory_approve', 'shipping', 'reports', 'billing']::text[];
$$;

CREATE TABLE IF NOT EXISTS public.department_permissions (
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission = ANY (public.permission_keys())),
  PRIMARY KEY (department_id, permission)
);
ALTER TABLE public.department_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission = ANY (public.permission_keys())),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Admins hold every permission. Managers keep what their role already covered.
-- Staff get only what their teams or a direct grant give them. Clients never.
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- The signed-in user's permissions, for showing the right menus.
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(p ORDER BY p), '{}'::text[])
  FROM unnest(public.permission_keys()) AS p
  WHERE public.has_permission(auth.uid(), p);
$$;

-- Teams and memberships are visible to the whole team (names on tasks, pickers); only admins change them.
DROP POLICY IF EXISTS "Team members read departments" ON public.departments;
CREATE POLICY "Team members read departments" ON public.departments
  FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(), 'client'::public.app_role));
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Admins manage departments" ON public.departments
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Team members read memberships" ON public.department_members;
CREATE POLICY "Team members read memberships" ON public.department_members
  FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(), 'client'::public.app_role));
DROP POLICY IF EXISTS "Admins manage memberships" ON public.department_members;
CREATE POLICY "Admins manage memberships" ON public.department_members
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(user_id, 'client'::public.app_role)
  );

DROP POLICY IF EXISTS "Team members read team permissions" ON public.department_permissions;
CREATE POLICY "Team members read team permissions" ON public.department_permissions
  FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(), 'client'::public.app_role));
DROP POLICY IF EXISTS "Admins manage team permissions" ON public.department_permissions;
CREATE POLICY "Admins manage team permissions" ON public.department_permissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "People read own permissions" ON public.user_permissions;
CREATE POLICY "People read own permissions" ON public.user_permissions
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );
DROP POLICY IF EXISTS "Admins manage permissions" ON public.user_permissions;
CREATE POLICY "Admins manage permissions" ON public.user_permissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(user_id, 'client'::public.app_role)
  );

-- Every permission and team change is written to the activity log.
CREATE OR REPLACE FUNCTION public.log_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
DROP TRIGGER IF EXISTS user_permissions_log ON public.user_permissions;
CREATE TRIGGER user_permissions_log AFTER INSERT OR DELETE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.log_access_change();
DROP TRIGGER IF EXISTS department_permissions_log ON public.department_permissions;
CREATE TRIGGER department_permissions_log AFTER INSERT OR DELETE ON public.department_permissions FOR EACH ROW EXECUTE FUNCTION public.log_access_change();
DROP TRIGGER IF EXISTS department_members_log ON public.department_members;
CREATE TRIGGER department_members_log AFTER INSERT OR UPDATE OR DELETE ON public.department_members FOR EACH ROW EXECUTE FUNCTION public.log_access_change();

-- Starting teams. Admins can rename them, change their permissions or add more.
INSERT INTO public.departments (name, description) VALUES
  ('Reception', 'Logs machines as they arrive and handles client requests.'),
  ('Technical management', 'Plans projects, assigns teams and signs off quality. Add a deputy so someone can always cover.'),
  ('Inventory', 'Stock, parts requests, suppliers and purchasing.'),
  ('Shipping', 'Collections, deliveries and courier shipments.')
ON CONFLICT DO NOTHING;

INSERT INTO public.department_permissions (department_id, permission)
SELECT d.id, p.perm FROM public.departments d
JOIN (VALUES
  ('Reception', 'reception'),
  ('Technical management', 'planning'),
  ('Technical management', 'quality'),
  ('Technical management', 'reception'),
  ('Inventory', 'inventory'),
  ('Shipping', 'shipping')
) AS p(dept, perm) ON lower(d.name) = lower(p.dept)
ON CONFLICT DO NOTHING;

-- ─── 3. Who can see a project ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_view_job(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
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

-- Storage paths start with the project ID; non-UUID folders simply don't match.
CREATE OR REPLACE FUNCTION public.can_view_job_path(_user_id uuid, _folder text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.can_view_job(_user_id, _folder::uuid);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

-- Workflow roles (reception, planners, quality, shipping) can move a project along.
CREATE OR REPLACE FUNCTION public.can_run_job(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_permission(_user_id, 'reception') OR public.has_permission(_user_id, 'planning')
      OR public.has_permission(_user_id, 'quality') OR public.has_permission(_user_id, 'shipping');
$$;

DROP POLICY IF EXISTS "Team members view their projects" ON public.jobs;
CREATE POLICY "Team members view their projects" ON public.jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_view_job(auth.uid(), id));
DROP POLICY IF EXISTS "Workflow staff update projects" ON public.jobs;
CREATE POLICY "Workflow staff update projects" ON public.jobs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_run_job(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_run_job(auth.uid()));
DROP POLICY IF EXISTS "Reception creates projects" ON public.jobs;
CREATE POLICY "Reception creates projects" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.has_permission(auth.uid(), 'reception'));

-- ─── 4. Tasks belong to a team, then optionally a person ───────────────────


-- Completed tasks already in the system keep a completion time.
UPDATE public.job_tasks SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;

DROP POLICY IF EXISTS "Team members view project tasks" ON public.job_tasks;
CREATE POLICY "Team members view project tasks" ON public.job_tasks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_view_job(auth.uid(), job_id));
DROP POLICY IF EXISTS "Planners manage tasks" ON public.job_tasks;
CREATE POLICY "Planners manage tasks" ON public.job_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.has_permission(auth.uid(), 'planning'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.has_permission(auth.uid(), 'planning'));
-- A team lead assigns their team's tasks to people in the team.
DROP POLICY IF EXISTS "Team leads assign team tasks" ON public.job_tasks;
CREATE POLICY "Team leads assign team tasks" ON public.job_tasks
  FOR UPDATE TO authenticated
  USING (department_id IN (SELECT m.department_id FROM public.department_members m WHERE m.user_id = auth.uid() AND m.is_lead))
  WITH CHECK (
    department_id IN (SELECT m.department_id FROM public.department_members m WHERE m.user_id = auth.uid() AND m.is_lead)
    AND (assigned_to IS NULL OR assigned_to IN (SELECT m.user_id FROM public.department_members m WHERE m.department_id = job_tasks.department_id))
  );

-- Anyone in the team can pick up an unassigned team task, for themselves only.
DROP POLICY IF EXISTS "Team members claim team tasks" ON public.job_tasks;
CREATE POLICY "Team members claim team tasks" ON public.job_tasks
  FOR UPDATE TO authenticated
  USING (
    assigned_to IS NULL AND status <> 'completed'
    AND department_id IN (SELECT m.department_id FROM public.department_members m WHERE m.user_id = auth.uid())
  )
  WITH CHECK (
    assigned_to = auth.uid()
    AND department_id IN (SELECT m.department_id FROM public.department_members m WHERE m.user_id = auth.uid())
  );

-- Old policy: completing a task by reassigning it to someone else. Handoffs replace it.
DROP POLICY IF EXISTS "Assigned staff can complete and hand off own task" ON public.job_tasks;

DROP POLICY IF EXISTS "Team members view task notes" ON public.job_task_notes;
CREATE POLICY "Team members view task notes" ON public.job_task_notes
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.job_tasks t WHERE t.id = job_task_notes.task_id AND public.can_view_job(auth.uid(), t.job_id))
  );
DROP POLICY IF EXISTS "Team members add task notes" ON public.job_task_notes;
CREATE POLICY "Team members add task notes" ON public.job_task_notes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND public.has_role(auth.uid(), 'staff'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.job_tasks t WHERE t.id = job_task_notes.task_id AND public.can_view_job(auth.uid(), t.job_id))
  );

-- Notes, files and the timeline follow the same visibility.
DROP POLICY IF EXISTS "Team members read project notes" ON public.job_comments;
CREATE POLICY "Team members read project notes" ON public.job_comments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_view_job(auth.uid(), job_id));

DROP POLICY IF EXISTS "Team members view project files" ON public.job_attachments;
CREATE POLICY "Team members view project files" ON public.job_attachments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_view_job(auth.uid(), job_id));
DROP POLICY IF EXISTS "Team members add project files" ON public.job_attachments;
CREATE POLICY "Team members add project files" ON public.job_attachments
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by = auth.uid()
    AND public.has_role(auth.uid(), 'staff'::public.app_role)
    AND public.can_view_job(auth.uid(), job_id)
    AND kind IN ('intake', 'work', 'handoff', 'delivery')
    AND (kind <> 'intake' OR public.has_permission(auth.uid(), 'reception') OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.assigned_staff_id = auth.uid()))
    AND (kind <> 'delivery' OR public.has_permission(auth.uid(), 'shipping'))
  );

DROP POLICY IF EXISTS "Team reads project events" ON public.project_events;
CREATE POLICY "Team reads project events" ON public.project_events
  FOR SELECT TO authenticated USING (
    NOT public.has_role(auth.uid(), 'client'::public.app_role) AND public.can_view_job(auth.uid(), job_id)
  );

-- Storage: team members open and upload files for projects they can see.
DROP POLICY IF EXISTS "Users can read own job attachments" ON storage.objects;
CREATE POLICY "Users can read own job attachments" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'job-attachments'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.can_view_job_path(auth.uid(), (storage.foldername(objects.name))[1]))
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
DROP POLICY IF EXISTS "Team members upload project files" ON storage.objects;
CREATE POLICY "Team members upload project files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'job-attachments'
    AND public.has_role(auth.uid(), 'staff'::public.app_role)
    AND public.can_view_job_path(auth.uid(), (storage.foldername(objects.name))[1])
  );

-- ─── 5. Handoffs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 2000),
  hours numeric CHECK (hours IS NULL OR (hours > 0 AND hours <= 24)),
  next_task_id uuid REFERENCES public.job_tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_handoffs_task_idx ON public.task_handoffs (task_id);
CREATE INDEX IF NOT EXISTS task_handoffs_job_idx ON public.task_handoffs (job_id, created_at);
ALTER TABLE public.task_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team reads handoffs" ON public.task_handoffs;
CREATE POLICY "Team reads handoffs" ON public.task_handoffs
  FOR SELECT TO authenticated USING (NOT public.has_role(auth.uid(), 'client'::public.app_role) AND public.can_view_job(auth.uid(), job_id));

-- ─── 6. Time logging and labour cost ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.job_tasks(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hours numeric NOT NULL CHECK (hours > 0 AND hours <= 24),
  work_date date NOT NULL DEFAULT current_date,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_entries_job_idx ON public.time_entries (job_id);
CREATE INDEX IF NOT EXISTS time_entries_user_idx ON public.time_entries (user_id, work_date);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "People log their own time" ON public.time_entries;
CREATE POLICY "People log their own time" ON public.time_entries
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND NOT public.has_role(auth.uid(), 'client'::public.app_role) AND public.can_view_job(auth.uid(), job_id)
  );
DROP POLICY IF EXISTS "People fix their own time" ON public.time_entries;
CREATE POLICY "People fix their own time" ON public.time_entries
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role));
DROP POLICY IF EXISTS "Team reads time" ON public.time_entries;
CREATE POLICY "Team reads time" ON public.time_entries
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'planning')
    OR public.has_permission(auth.uid(), 'reports')
  );

-- A project's actual hours are the sum of the time logged against it.
CREATE OR REPLACE FUNCTION public.time_entries_sync_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
DROP TRIGGER IF EXISTS time_entries_sync_hours ON public.time_entries;
CREATE TRIGGER time_entries_sync_hours AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_sync_hours();

-- Hours typed in by hand before time logging existed become entries for the
-- project's lead, split into chunks of at most 24 so no hours are lost.
INSERT INTO public.time_entries (job_id, user_id, hours, work_date, note)
SELECT j.id, j.assigned_staff_id,
       LEAST(24, j.actual_hours - (g.n * 24)),
       COALESCE(j.updated_at, j.created_at)::date,
       'Hours recorded before time logging'
FROM public.jobs j
CROSS JOIN LATERAL generate_series(0, ceil(j.actual_hours / 24.0)::int - 1) AS g(n)
WHERE j.actual_hours > 0 AND j.assigned_staff_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.time_entries t WHERE t.job_id = j.id);

-- Hourly cost per person. Sensitive: admins edit; people with the Reports permission read.
CREATE TABLE IF NOT EXISTS public.labour_rates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hourly_cost numeric NOT NULL CHECK (hourly_cost >= 0 AND hourly_cost < 100000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.labour_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reporting reads labour rates" ON public.labour_rates;
CREATE POLICY "Reporting reads labour rates" ON public.labour_rates
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'reports'));
DROP POLICY IF EXISTS "Admins set labour rates" ON public.labour_rates;
CREATE POLICY "Admins set labour rates" ON public.labour_rates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ─── 7. Notifications between team members ─────────────────────────────────

-- Staff could only notify their own project's client. Team work needs them to
-- reach colleagues, and the client of any project they work on.
DROP POLICY IF EXISTS "Team members notify colleagues" ON public.notifications;
CREATE POLICY "Team members notify colleagues" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND NOT public.has_role(user_id, 'client'::public.app_role)
  );
DROP POLICY IF EXISTS "Team members notify project clients" ON public.notifications;
CREATE POLICY "Team members notify project clients" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'staff'::public.app_role)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.client_id = notifications.user_id AND public.can_view_job(auth.uid(), j.id))
  );

-- Everyone who holds a permission through a team or a direct grant.
CREATE OR REPLACE FUNCTION public.permission_holders(_permission text)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT m.user_id FROM public.department_members m
  JOIN public.department_permissions dp ON dp.department_id = m.department_id
  WHERE dp.permission = _permission AND NOT public.has_role(m.user_id, 'client'::public.app_role)
  UNION
  SELECT up.user_id FROM public.user_permissions up WHERE up.permission = _permission;
$$;
REVOKE ALL ON FUNCTION public.permission_holders(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_users(_users uuid[], _title text, _message text, _link text)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.notifications (user_id, title, message, link, read)
  SELECT DISTINCT u, _title, _message, _link, false FROM unnest(_users) AS u
  WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid();
$$;
REVOKE ALL ON FUNCTION public.notify_users(uuid[], text, text, text) FROM PUBLIC, anon, authenticated;

-- ─── 8. Handing off a task ──────────────────────────────────────────────────
-- Completes the task, records who did it and what's next, logs their time,
-- and moves the project to the quality check once every task is done.

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
REVOKE ALL ON FUNCTION public.handoff_task(uuid, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handoff_task(uuid, text, numeric, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_view_job(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_job(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
