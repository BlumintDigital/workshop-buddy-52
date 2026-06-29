ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_request_id uuid REFERENCES public.client_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_source_request_id ON public.jobs(source_request_id);

CREATE OR REPLACE FUNCTION public.accept_client_request(_request_id uuid, _assigned_staff_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _req public.client_requests%ROWTYPE;
  _job_id uuid;
  _desc text;
  _quote_lines text;
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

  _desc := COALESCE(_req.description, '');

  IF _req.request_type = 'quote' THEN
    SELECT string_agg('• ' || description || ' (x' || quantity || ' @ ' || unit_price || ')', E'\n')
      INTO _quote_lines
      FROM public.request_quote_items WHERE request_id = _req.id;
    IF _quote_lines IS NOT NULL THEN
      _desc := _desc || E'\n\n— Approved quote —\n' || _quote_lines;
      IF _req.quoted_total IS NOT NULL THEN
        _desc := _desc || E'\nTotal: ' || _req.quoted_total || ' ' || COALESCE(_req.quoted_currency, '');
      END IF;
      IF _req.quoted_notes IS NOT NULL AND length(_req.quoted_notes) > 0 THEN
        _desc := _desc || E'\nNotes: ' || _req.quoted_notes;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.jobs (title, description, priority, status, client_id, assigned_staff_id, due_date, source_request_id)
  VALUES (_req.title, _desc, _req.priority, 'pending', _req.client_id, _assigned_staff_id, _req.preferred_date, _req.id)
  RETURNING id INTO _job_id;

  UPDATE public.client_requests
    SET status = 'converted',
        converted_job_id = _job_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id;

  RETURN _job_id;
END;
$function$;