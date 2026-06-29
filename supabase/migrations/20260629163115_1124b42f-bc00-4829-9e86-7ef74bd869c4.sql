
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_instructions text,
  ADD COLUMN IF NOT EXISTS client_marked_paid_at timestamptz;

CREATE OR REPLACE FUNCTION public.client_mark_invoice_paid(_invoice_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.invoices%ROWTYPE;
  _ts timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF _row.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the invoice client can mark it paid' USING ERRCODE = '42501';
  END IF;
  IF _row.status = 'paid' THEN
    RAISE EXCEPTION 'Invoice is already paid' USING ERRCODE = '22023';
  END IF;
  IF _row.status NOT IN ('sent','overdue') THEN
    RAISE EXCEPTION 'Invoice is not awaiting payment' USING ERRCODE = '22023';
  END IF;
  UPDATE public.invoices SET client_marked_paid_at = _ts WHERE id = _invoice_id;
  RETURN _ts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.client_mark_invoice_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_mark_invoice_paid(uuid) TO authenticated;
