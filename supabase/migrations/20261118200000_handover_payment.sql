-- Payment before hand-over.
--
-- 1. A workshop setting: off, warn (default: unpaid needs a reason) or block
--    (unpaid can't leave; an admin can override with a reason).
-- 2. mark_shipped enforces it and records the unpaid reason in the same
--    transaction, so a machine never leaves unpaid with no reason on record.
--    It now returns true when it shipped, false when it was already shipped.
--
-- An invoice the client marked as paid counts as paid for Warn (no reason
-- needed) but not for Block (staff must confirm the payment first).
-- A walk-in with no invoice can't be invoiced in the portal, so Block asks
-- for a reason there instead of refusing.

ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS handover_payment text NOT NULL DEFAULT 'warn';
ALTER TABLE public.workshop_settings DROP CONSTRAINT IF EXISTS workshop_settings_handover_payment_check;
ALTER TABLE public.workshop_settings ADD CONSTRAINT workshop_settings_handover_payment_check
  CHECK (handover_payment IN ('off', 'warn', 'block'));

-- Shipping staff can't read workshop_settings, so they read the setting here.
CREATE OR REPLACE FUNCTION public.handover_payment_policy()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT handover_payment FROM public.workshop_settings WHERE id = 1), 'warn')
$$;
REVOKE ALL ON FUNCTION public.handover_payment_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handover_payment_policy() TO authenticated;

-- The reason now goes through mark_shipped.
DROP FUNCTION IF EXISTS public.note_unpaid_handover(uuid, text);
DROP FUNCTION IF EXISTS public.mark_shipped(uuid, jsonb);

-- Hand over: record who collected it or which courier took it.
CREATE OR REPLACE FUNCTION public.mark_shipped(_job_id uuid, _d jsonb, _reason text DEFAULT NULL)
RETURNS boolean
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
  _policy text;
  _inv_status text;
  _client_says_paid boolean := false;
  _why text := NULLIF(trim(COALESCE(_reason, '')), '');
  _override boolean := false;
BEGIN
  IF NOT public.has_permission(_uid, 'shipping') THEN RAISE EXCEPTION 'Only shipping can mark items as shipped' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _s FROM public.shipments WHERE job_id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This project isn''t ready to ship' USING ERRCODE = 'P0002'; END IF;
  -- A second click, or a retry after a dropped connection, changes nothing.
  IF _s.status = 'shipped' THEN RETURN false; END IF;
  _method := COALESCE(NULLIF(_d->>'method', ''), _s.method);
  IF _method = 'pickup' AND length(trim(COALESCE(_d->>'collector_name', ''))) = 0 THEN RAISE EXCEPTION 'Record who collected it' USING ERRCODE = '22023'; END IF;
  IF _method = 'courier' AND length(trim(COALESCE(_d->>'carrier', ''))) = 0 THEN RAISE EXCEPTION 'Record the courier' USING ERRCODE = '22023'; END IF;
  IF _method IS NULL THEN RAISE EXCEPTION 'Choose collection or courier' USING ERRCODE = '22023'; END IF;
  IF length(_why) > 2000 THEN RAISE EXCEPTION 'Keep the reason under 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id FOR UPDATE;

  -- Payment before hand-over. The latest invoice, as project_billing_status picks it.
  _policy := public.handover_payment_policy();
  SELECT v.status, v.client_marked_paid_at IS NOT NULL INTO _inv_status, _client_says_paid
    FROM public.invoices v
    WHERE v.job_id = _job_id AND v.status <> 'cancelled'
    ORDER BY (v.status = 'paid') DESC, v.created_at DESC
    LIMIT 1;
  IF _policy <> 'off' AND _inv_status IS DISTINCT FROM 'paid' THEN
    IF _policy = 'block' AND NOT (_job.client_id IS NULL AND _inv_status IS NULL) THEN
      IF NOT public.has_role(_uid, 'admin') THEN
        RAISE EXCEPTION 'This project must be paid for before it leaves. Confirm the payment, or ask an admin.' USING ERRCODE = '42501';
      END IF;
      IF _why IS NULL THEN RAISE EXCEPTION 'Say why it''s leaving before it''s paid for' USING ERRCODE = '22023'; END IF;
      _override := true;
    ELSIF _why IS NULL AND NOT COALESCE(_client_says_paid, false) THEN
      RAISE EXCEPTION 'Say why it''s leaving before it''s paid for' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Stage changes on jobs are only allowed from stage functions like this one.
  PERFORM set_config('shoplane.stage_rpc', 'on', true);
  UPDATE public.jobs SET status = 'shipped' WHERE id = _job_id AND status = 'completed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This project is no longer ready to ship. Reload the page to see what changed.' USING ERRCODE = '22023';
  END IF;

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

  IF _why IS NOT NULL AND _inv_status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.job_comments (job_id, user_id, body, is_internal)
    VALUES (_job_id, _uid, left('Handed over before payment' || CASE WHEN _override THEN ' (admin override)' ELSE '' END || ': ' || _why, 2000), true);
    PERFORM public.add_project_event(_job_id, 'unpaid_handover', jsonb_build_object('reason', _why, 'override', _override));
  END IF;

  _detail := CASE WHEN _method = 'pickup'
    THEN 'Collected by ' || trim(_d->>'collector_name')
    ELSE trim(_d->>'carrier') || COALESCE(' · ' || NULLIF(trim(COALESCE(_d->>'tracking_number', '')), ''), '') END;
  PERFORM public.add_project_event(_job_id, 'shipped', jsonb_build_object('method', _method, 'detail', _detail), true);
  IF _job.client_id IS NOT NULL THEN
    PERFORM public.notify_users(ARRAY[_job.client_id],
      CASE WHEN _method = 'pickup' THEN 'Collected: ' ELSE 'On its way: ' END || _job.ref, _detail, '/projects/' || _job_id);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_shipped(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_shipped(uuid, jsonb, text) TO authenticated;
