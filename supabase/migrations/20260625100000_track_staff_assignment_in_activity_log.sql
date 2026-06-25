-- Index for per-job activity log queries (used on every job detail page load)
CREATE INDEX IF NOT EXISTS idx_activity_logs_record_id
  ON public.activity_logs (record_id);

-- Allow managers to read activity logs (needed for job detail assignment timeline)
CREATE POLICY "Managers can view activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::public.app_role));

-- Extend log_activity() to also capture assigned_staff_id changes on jobs.
-- The jobs section now merges status_change and staff_assignment into the same
-- details JSONB so a single update that changes both is recorded in one row.
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
