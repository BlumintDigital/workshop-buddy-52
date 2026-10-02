-- Quote approval by secure link: a customer without a portal account opens a link, sees the
-- quote and approves or declines it. The link is a random token; only its SHA-256 hash is
-- stored, so a database read can't be turned into a working link. Creating a link revokes the
-- quote's earlier links. The public page talks to the quote-link edge function, which uses the
-- service role to call the two server-only functions below.

CREATE TABLE IF NOT EXISTS public.quote_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.project_quotes (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  sent_to text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  first_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS quote_links_quote_idx ON public.quote_links (quote_id);

ALTER TABLE public.quote_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_links FROM anon, authenticated;
GRANT SELECT ON public.quote_links TO authenticated;
DROP POLICY IF EXISTS "Session must have passed 2FA" ON public.quote_links;
CREATE POLICY "Session must have passed 2FA" ON public.quote_links AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.session_verified())) WITH CHECK ((SELECT public.session_verified()));
-- The team that quotes can see a quote's links (sent to whom, opened, used); never the token.
DROP POLICY IF EXISTS "Quoting team reads links" ON public.quote_links;
CREATE POLICY "Quoting team reads links" ON public.quote_links FOR SELECT TO authenticated
  USING (public.can_quote((SELECT auth.uid())));

-- ---------------------------------------------------------------- Make a link (the team)
-- Returns the token once; the caller turns it into https://<site>/q/<token>.
CREATE OR REPLACE FUNCTION public.create_quote_link(_quote_id uuid, _sent_to text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _uid uuid := auth.uid();
  _q public.project_quotes%ROWTYPE;
  _token text;
BEGIN
  PERFORM public.assert_verified_session();
  IF NOT public.can_quote(_uid) THEN RAISE EXCEPTION 'You can''t share quotes' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found' USING ERRCODE = 'P0002'; END IF;
  IF _q.status <> 'sent' THEN RAISE EXCEPTION 'Send the quote first; only a quote waiting for the customer can be shared' USING ERRCODE = '22023'; END IF;

  UPDATE public.quote_links SET revoked_at = now() WHERE quote_id = _quote_id AND revoked_at IS NULL AND used_at IS NULL;
  _token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  INSERT INTO public.quote_links (quote_id, token_hash, sent_to, created_by, expires_at)
  VALUES (
    _quote_id,
    encode(digest(_token, 'sha256'), 'hex'),
    NULLIF(trim(COALESCE(_sent_to, '')), ''),
    _uid,
    GREATEST(COALESCE(_q.valid_until::timestamptz + interval '1 day', now() + interval '30 days'), now() + interval '1 day')
  );
  PERFORM public.add_project_event(_q.job_id, 'quote_link_shared',
    jsonb_build_object('label', public.project_quote_label(_q.job_id, _q.kind, _q.number),
                       'sent_to', NULLIF(trim(COALESCE(_sent_to, '')), '')));
  RETURN _token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_quote_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quote_link(uuid, text) TO authenticated;

-- ---------------------------------------------------------------- What the link shows (server only)
-- Only this quote, its lines, the project it's for and the workshop's public details.
CREATE OR REPLACE FUNCTION public.quote_link_view(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _l public.quote_links%ROWTYPE;
  _q public.project_quotes%ROWTYPE;
  _j public.jobs%ROWTYPE;
  _ws public.workshop_settings%ROWTYPE;
  _customer text;
BEGIN
  SELECT * INTO _l FROM public.quote_links WHERE token_hash = encode(digest(COALESCE(_token, ''), 'sha256'), 'hex');
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'invalid'); END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _l.quote_id;
  SELECT * INTO _j FROM public.jobs WHERE id = _q.job_id;
  SELECT * INTO _ws FROM public.workshop_settings WHERE id = 1;

  UPDATE public.quote_links SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, now()) WHERE id = _l.id;
  IF _l.first_viewed_at IS NULL THEN
    PERFORM public.add_project_event(_q.job_id, 'quote_link_opened',
      jsonb_build_object('label', public.project_quote_label(_q.job_id, _q.kind, _q.number)));
  END IF;

  SELECT COALESCE(NULLIF(p.company_name, ''), p.full_name) INTO _customer FROM public.profiles p WHERE p.id = _j.client_id;
  RETURN jsonb_build_object(
    'state', CASE
      WHEN _l.revoked_at IS NOT NULL THEN 'revoked'
      WHEN _q.status IN ('accepted', 'declined') THEN _q.status
      WHEN _q.status <> 'sent' THEN 'withdrawn'
      WHEN _l.expires_at < now() THEN 'expired'
      ELSE 'open' END,
    'workshop', jsonb_build_object('name', _ws.workshop_name, 'logo_url', _ws.logo_url, 'phone', _ws.phone,
                                   'email', _ws.contact_email, 'address', _ws.address,
                                   'brand_primary_hsl', _ws.brand_primary_hsl, 'brand_accent_hsl', _ws.brand_accent_hsl),
    'project', jsonb_build_object('ref', _j.ref, 'title', _j.title, 'make_model', _j.make_model,
                                  'registration', _j.registration, 'serial_number', _j.serial_number),
    'customer', COALESCE(_customer, _j.contact_name),
    'quote', jsonb_build_object(
      'label', public.project_quote_label(_q.job_id, _q.kind, _q.number),
      'kind', _q.kind, 'title', _q.title, 'reason', _q.reason, 'notes', _q.notes,
      'currency', _q.currency, 'subtotal', _q.subtotal, 'valid_until', _q.valid_until,
      'schedule_impact_days', _q.schedule_impact_days, 'sent_at', _q.sent_at, 'decided_at', _q.decided_at,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price) ORDER BY i.position)
                         FROM public.project_quote_items i WHERE i.quote_id = _q.id), '[]'::jsonb)),
    'expires_at', _l.expires_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.quote_link_view(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_link_view(text) TO service_role;

-- ---------------------------------------------------------------- The customer decides (server only)
-- Same effects as decide_project_quote, recorded as the customer's decision by link with the
-- name they typed and where they decided from.
CREATE OR REPLACE FUNCTION public.decide_quote_by_link(_token text, _accept boolean, _name text, _note text DEFAULT NULL, _ip text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _l public.quote_links%ROWTYPE;
  _q public.project_quotes%ROWTYPE;
  _job public.jobs%ROWTYPE;
  _label text;
  _status text := CASE WHEN _accept THEN 'accepted' ELSE 'declined' END;
  _who text := left(trim(COALESCE(_name, '')), 120);
  _why text := NULLIF(left(trim(COALESCE(_note, '')), 1000), '');
BEGIN
  IF length(_who) < 2 THEN RAISE EXCEPTION 'Type your name to confirm' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _l FROM public.quote_links WHERE token_hash = encode(digest(COALESCE(_token, ''), 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR _l.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This link is no longer valid' USING ERRCODE = '42501'; END IF;
  IF _l.expires_at < now() THEN RAISE EXCEPTION 'This link has expired. Ask the workshop for a new one' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _q FROM public.project_quotes WHERE id = _l.quote_id FOR UPDATE;
  IF _q.status <> 'sent' THEN RAISE EXCEPTION 'This quote isn''t waiting for a decision any more' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _q.job_id FOR UPDATE;
  _label := public.project_quote_label(_q.job_id, _q.kind, _q.number);

  UPDATE public.project_quotes
    SET status = _status, decided_at = now(), decided_by = NULL,
        decision_note = left(concat_ws(' · ', 'By link: ' || _who, _why), 1200)
    WHERE id = _q.id;
  UPDATE public.quote_links SET used_at = now() WHERE id = _l.id;
  PERFORM public.add_project_event(_q.job_id, CASE WHEN _accept THEN 'quote_accepted' ELSE 'quote_declined' END,
    jsonb_build_object('label', CASE WHEN _q.kind = 'quote' THEN 'Quote ' ELSE 'Change request ' END || _label,
                       'reason', _why, 'via_link', true, 'name', _who, 'ip', left(COALESCE(_ip, ''), 64)), true);

  IF _q.kind = 'quote' AND _accept THEN
    UPDATE public.project_quotes SET status = 'withdrawn' WHERE job_id = _q.job_id AND kind = 'quote' AND id <> _q.id AND status IN ('draft', 'pending_approval', 'sent');
    IF _job.status IN ('received', 'evaluation', 'quote') THEN
      UPDATE public.jobs SET status = 'pending' WHERE id = _q.job_id;
    END IF;
  END IF;

  PERFORM public.notify_users(
    ARRAY(SELECT public.permission_holders('planning')) || ARRAY[_q.created_by, _job.assigned_staff_id, _l.created_by],
    CASE WHEN _accept THEN 'Accepted by link: ' ELSE 'Declined by link: ' END || _label,
    _job.title || U&' \00B7 ' || _who || CASE WHEN _why IS NOT NULL THEN U&' \00B7 ' || left(_why, 120) ELSE '' END,
    '/projects/' || _q.job_id);
  RETURN _status;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_quote_by_link(text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_quote_by_link(text, boolean, text, text, text) TO service_role;
