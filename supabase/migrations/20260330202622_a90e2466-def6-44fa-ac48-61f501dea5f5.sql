-- Activity logs table to track all platform changes
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  summary text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_table_name ON public.activity_logs(table_name);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity logs"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

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
    IF TG_OP = 'DELETE' THEN _summary := 'Job "' || OLD.title || '" was deleted';
    ELSIF TG_OP = 'INSERT' THEN _summary := 'Job "' || NEW.title || '" was created';
    ELSE _summary := 'Job "' || NEW.title || '" was updated';
      IF OLD.status IS DISTINCT FROM NEW.status THEN _details := jsonb_build_object('status_change', OLD.status || ' → ' || NEW.status); END IF;
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

CREATE TRIGGER trg_activity_log_jobs AFTER INSERT OR UPDATE OR DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_appointments AFTER INSERT OR UPDATE OR DELETE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_inventory AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_profiles AFTER INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_activity();
CREATE TRIGGER trg_activity_log_tasks AFTER INSERT OR UPDATE OR DELETE ON public.job_tasks FOR EACH ROW EXECUTE FUNCTION public.log_activity();