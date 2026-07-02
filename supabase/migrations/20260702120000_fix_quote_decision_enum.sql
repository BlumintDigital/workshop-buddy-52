-- Fix: clients cannot approve or decline quotes.
--
-- client_requests.status is the enum client_request_status, created with
-- values ('pending','quoted','accepted','declined','cancelled','converted').
-- The quote-decision flow (client_decide_quote / accept_client_request /
-- the frontend) uses 'approved' and 'declined_by_client', which were never
-- added to the enum. client_decide_quote also assigns a text variable
-- directly to the enum column, which Postgres rejects (42804) even for
-- valid values.

ALTER TYPE public.client_request_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.client_request_status ADD VALUE IF NOT EXISTS 'declined_by_client';

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
    SET status = _new_status::public.client_request_status,
        client_decision_at = now(),
        decline_reason = CASE WHEN _approve THEN NULL ELSE _reason END
    WHERE id = _request_id;

  RETURN _new_status;
END;
$$;
