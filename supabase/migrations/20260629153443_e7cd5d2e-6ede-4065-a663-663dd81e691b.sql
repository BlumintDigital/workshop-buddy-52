
-- Enum types
DO $$ BEGIN
  CREATE TYPE public.client_request_type AS ENUM ('quote', 'job');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.client_request_status AS ENUM ('pending', 'quoted', 'accepted', 'declined', 'cancelled', 'converted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.client_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type public.client_request_type NOT NULL,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  preferred_date date,
  status public.client_request_status NOT NULL DEFAULT 'pending',
  decline_reason text,
  converted_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  quoted_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_requests_client_id_idx ON public.client_requests(client_id);
CREATE INDEX IF NOT EXISTS client_requests_status_idx ON public.client_requests(status);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.client_requests TO authenticated;
GRANT ALL ON public.client_requests TO service_role;

-- RLS
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own requests"
  ON public.client_requests FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Admins and managers can view all requests"
  ON public.client_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Clients can create own requests"
  ON public.client_requests FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid() AND status = 'pending');

CREATE POLICY "Clients can cancel own pending requests"
  ON public.client_requests FOR UPDATE TO authenticated
  USING (client_id = auth.uid() AND status = 'pending')
  WITH CHECK (client_id = auth.uid() AND status IN ('pending','cancelled'));

CREATE POLICY "Admins and managers can update requests"
  ON public.client_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- updated_at trigger
CREATE TRIGGER client_requests_set_updated_at
  BEFORE UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Activity log
CREATE TRIGGER client_requests_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- Accept a request: creates a job and links it
CREATE OR REPLACE FUNCTION public.accept_client_request(
  _request_id uuid,
  _assigned_staff_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _job_id uuid;
  _job_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Admin or manager access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _req FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _req.status NOT IN ('pending','quoted') THEN
    RAISE EXCEPTION 'Request cannot be accepted in its current state' USING ERRCODE = '22023';
  END IF;

  _job_status := CASE WHEN _req.request_type = 'quote' THEN 'quote' ELSE 'pending' END;

  INSERT INTO public.jobs (title, description, priority, status, client_id, assigned_staff_id, due_date)
  VALUES (_req.title, _req.description, _req.priority, _job_status, _req.client_id, _assigned_staff_id, _req.preferred_date)
  RETURNING id INTO _job_id;

  UPDATE public.client_requests
    SET status = 'converted',
        converted_job_id = _job_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id;

  RETURN _job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_client_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_client_request(uuid, uuid) TO authenticated;

-- Decline a request
CREATE OR REPLACE FUNCTION public.decline_client_request(
  _request_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'Admin or manager access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.client_requests
    SET status = 'declined',
        decline_reason = _reason,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id
      AND status IN ('pending','quoted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already finalised' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_client_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_client_request(uuid, text) TO authenticated;
