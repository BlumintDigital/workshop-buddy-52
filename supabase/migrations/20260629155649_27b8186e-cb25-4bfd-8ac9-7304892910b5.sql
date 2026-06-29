
-- Quote items table
CREATE TABLE IF NOT EXISTS public.request_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.client_requests(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_quote_items TO authenticated;
GRANT ALL ON public.request_quote_items TO service_role;

ALTER TABLE public.request_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client reads own request items" ON public.request_quote_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.client_requests cr WHERE cr.id = request_id AND cr.client_id = auth.uid()));

CREATE POLICY "Admin/manager read all request items" ON public.request_quote_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admin/manager manage request items" ON public.request_quote_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER set_request_quote_items_updated_at
  BEFORE UPDATE ON public.request_quote_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extra columns on client_requests
ALTER TABLE public.client_requests
  ADD COLUMN IF NOT EXISTS quoted_total numeric,
  ADD COLUMN IF NOT EXISTS quoted_currency text,
  ADD COLUMN IF NOT EXISTS quoted_notes text,
  ADD COLUMN IF NOT EXISTS quote_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_decision_at timestamptz;

-- submit_quote RPC
CREATE OR REPLACE FUNCTION public.submit_quote(
  _request_id uuid,
  _currency text,
  _notes text,
  _expires_at timestamptz,
  _items jsonb
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _total numeric := 0;
  _item jsonb;
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
  IF _req.request_type <> 'quote' THEN
    RAISE EXCEPTION 'Only quote requests accept a quote' USING ERRCODE = '22023';
  END IF;
  IF _req.status NOT IN ('pending','quoted') THEN
    RAISE EXCEPTION 'Quote can only be sent while pending or quoted' USING ERRCODE = '22023';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.request_quote_items WHERE request_id = _request_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.request_quote_items (request_id, description, quantity, unit_price)
    VALUES (
      _request_id,
      COALESCE(_item->>'description',''),
      COALESCE((_item->>'quantity')::numeric, 1),
      COALESCE((_item->>'unit_price')::numeric, 0)
    );
    _total := _total + COALESCE((_item->>'quantity')::numeric, 1) * COALESCE((_item->>'unit_price')::numeric, 0);
  END LOOP;

  UPDATE public.client_requests
    SET status = 'quoted',
        quoted_total = _total,
        quoted_currency = COALESCE(_currency, quoted_currency),
        quoted_notes = _notes,
        quote_expires_at = _expires_at,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        client_decision_at = NULL,
        decline_reason = NULL
    WHERE id = _request_id;

  RETURN _total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_quote(uuid, text, text, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quote(uuid, text, text, timestamptz, jsonb) TO authenticated, service_role;

-- client_decide_quote RPC
CREATE OR REPLACE FUNCTION public.client_decide_quote(
  _request_id uuid,
  _approve boolean,
  _reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _new_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _req FROM public.client_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF _req.client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the requesting client can respond to this quote' USING ERRCODE = '42501';
  END IF;
  IF _req.status <> 'quoted' THEN
    RAISE EXCEPTION 'No quote is awaiting your decision' USING ERRCODE = '22023';
  END IF;

  _new_status := CASE WHEN _approve THEN 'approved' ELSE 'declined_by_client' END;

  UPDATE public.client_requests
    SET status = _new_status,
        client_decision_at = now(),
        decline_reason = CASE WHEN _approve THEN NULL ELSE _reason END
    WHERE id = _request_id;

  RETURN _new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.client_decide_quote(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_decide_quote(uuid, boolean, text) TO authenticated, service_role;

-- Update accept_client_request so quote-type needs approved
CREATE OR REPLACE FUNCTION public.accept_client_request(_request_id uuid, _assigned_staff_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.client_requests%ROWTYPE;
  _job_id uuid;
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

  IF _req.request_type = 'quote' THEN
    IF _req.status <> 'approved' THEN
      RAISE EXCEPTION 'Quote must be approved by the client before converting to a job' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF _req.status NOT IN ('pending') THEN
      RAISE EXCEPTION 'Request cannot be accepted in its current state' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.jobs (title, description, priority, status, client_id, assigned_staff_id, due_date)
  VALUES (_req.title, _req.description, _req.priority, 'pending', _req.client_id, _assigned_staff_id, _req.preferred_date)
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

REVOKE EXECUTE ON FUNCTION public.accept_client_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_client_request(uuid, uuid) TO authenticated, service_role;
