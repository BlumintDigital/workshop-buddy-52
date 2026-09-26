-- Projects, phase E: shipping.
-- A shipment per project once it passes its quality check: the client is told
-- it's ready, chooses collection or courier, and shipping records who
-- collected it (with the signed delivery ticket) or the courier and tracking.

CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'awaiting_client', 'scheduled', 'shipped')),
  method text CHECK (method IN ('pickup', 'courier')),
  preferred_date date,
  delivery_address text CHECK (delivery_address IS NULL OR length(delivery_address) <= 500),
  client_notes text CHECK (client_notes IS NULL OR length(client_notes) <= 1000),
  notified_at timestamptz,
  choice_made_at timestamptz,
  collector_name text,
  collector_id_number text,
  collector_phone text,
  vehicle_make text,
  vehicle_registration text,
  carrier text,
  tracking_number text,
  tracking_url text CHECK (tracking_url IS NULL OR tracking_url ~* '^https?://'),
  shipping_cost numeric CHECK (shipping_cost IS NULL OR shipping_cost >= 0),
  currency text,
  shipped_at timestamptz,
  shipped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_status_idx ON public.shipments (status);
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS shipments_set_updated_at ON public.shipments;
CREATE TRIGGER shipments_set_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Team reads shipments" ON public.shipments;
CREATE POLICY "Team reads shipments" ON public.shipments
  FOR SELECT TO authenticated USING (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND (public.has_permission(auth.uid(), 'shipping') OR public.can_view_job(auth.uid(), job_id))
  );
DROP POLICY IF EXISTS "Clients read their shipment" ON public.shipments;
CREATE POLICY "Clients read their shipment" ON public.shipments
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = shipments.job_id AND j.client_id = auth.uid()));
-- Changes go through the functions below so each step is recorded and notified.

-- Passing the quality check puts the project in the shipping queue.
CREATE OR REPLACE FUNCTION public.jobs_open_shipment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.shipments (job_id) VALUES (NEW.id) ON CONFLICT (job_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS jobs_open_shipment ON public.jobs;
CREATE TRIGGER jobs_open_shipment AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_open_shipment();

-- Projects already ready to ship join the queue.
INSERT INTO public.shipments (job_id)
SELECT id FROM public.jobs WHERE status = 'completed'
ON CONFLICT (job_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_ready_to_ship(_job_id uuid, _message text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _s public.shipments%ROWTYPE;
  _job public.jobs%ROWTYPE;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'shipping') THEN RAISE EXCEPTION 'Only shipping can do this' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = 'P0002'; END IF;
  IF _s.status = 'shipped' THEN RAISE EXCEPTION 'Already shipped' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  UPDATE public.shipments SET status = CASE WHEN status = 'ready' THEN 'awaiting_client' ELSE status END, notified_at = now() WHERE id = _s.id;
  PERFORM public.add_project_event(_job_id, 'shipment_notified', jsonb_build_object('message', _message), true);
  IF _job.client_id IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_job.client_id], 'Your item is ready',
      _job.ref || ' · ' || _job.title || '. Choose collection or delivery.' || CASE WHEN _message IS NOT NULL AND length(trim(_message)) > 0 THEN ' ' || left(trim(_message), 150) ELSE '' END,
      '/projects/' || _job_id);
  END IF;
END;
$$;

-- The client (or shipping, for walk-ins) chooses collection or courier.
CREATE OR REPLACE FUNCTION public.choose_handover(_job_id uuid, _method text, _preferred_date date DEFAULT NULL, _address text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s public.shipments%ROWTYPE;
  _job public.jobs%ROWTYPE;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF NOT FOUND OR NOT (_job.client_id = _uid OR public.has_permission(_uid, 'shipping')) THEN
    RAISE EXCEPTION 'You can''t arrange delivery for this project' USING ERRCODE = '42501';
  END IF;
  IF _method NOT IN ('pickup', 'courier') THEN RAISE EXCEPTION 'Choose collection or delivery' USING ERRCODE = '22023'; END IF;
  IF _method = 'courier' AND (_address IS NULL OR length(trim(_address)) = 0) THEN RAISE EXCEPTION 'Add the delivery address' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND OR _s.status NOT IN ('ready', 'awaiting_client', 'scheduled') THEN RAISE EXCEPTION 'This project isn''t ready for collection or delivery yet' USING ERRCODE = '22023'; END IF;
  UPDATE public.shipments
    SET status = 'scheduled', method = _method, preferred_date = _preferred_date,
        delivery_address = CASE WHEN _method = 'courier' THEN trim(_address) ELSE NULL END,
        client_notes = NULLIF(trim(COALESCE(_notes, '')), ''), choice_made_at = now()
    WHERE id = _s.id;
  PERFORM public.add_project_event(_job_id, 'handover_chosen', jsonb_build_object('method', _method, 'date', _preferred_date), true);
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('shipping')),
    CASE WHEN _method = 'pickup' THEN 'Collection booked: ' ELSE 'Delivery requested: ' END || _job.ref,
    _job.title || CASE WHEN _preferred_date IS NOT NULL THEN ' · ' || to_char(_preferred_date, 'DD Mon') ELSE '' END,
    '/shipping');
END;
$$;

-- Hand over: record who collected it or which courier took it.
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
  IF NOT public.has_permission(_uid, 'shipping') THEN RAISE EXCEPTION 'Only shipping can mark items as shipped' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = 'P0002'; END IF;
  IF _s.status = 'shipped' THEN RAISE EXCEPTION 'Already shipped' USING ERRCODE = '22023'; END IF;
  _method := COALESCE(NULLIF(_d->>'method', ''), _s.method);
  IF _method = 'pickup' AND length(trim(COALESCE(_d->>'collector_name', ''))) = 0 THEN RAISE EXCEPTION 'Record who collected it' USING ERRCODE = '22023'; END IF;
  IF _method = 'courier' AND length(trim(COALESCE(_d->>'carrier', ''))) = 0 THEN RAISE EXCEPTION 'Record the courier' USING ERRCODE = '22023'; END IF;
  IF _method IS NULL THEN RAISE EXCEPTION 'Choose collection or courier' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;

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

  UPDATE public.jobs SET status = 'shipped' WHERE id = _job_id;
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

REVOKE ALL ON FUNCTION public.notify_ready_to_ship(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_ready_to_ship(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.choose_handover(uuid, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_handover(uuid, text, date, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_shipped(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_shipped(uuid, jsonb) TO authenticated;
