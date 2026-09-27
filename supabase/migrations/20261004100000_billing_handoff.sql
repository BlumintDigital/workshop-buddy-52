-- Billing hand-off.
--
-- 1. The Billing permission becomes real: staff who hold it can create, send
--    and confirm invoices like admins and managers.
-- 2. When a project passes its quality check, the draft invoice made from the
--    accepted quote is announced to everyone who handles billing (and a
--    project with no client account is flagged for billing outside the portal).
-- 3. Shipping sees each project's invoice and payment status, and a machine
--    handed over unpaid gets a recorded reason.

-- ─── 1. Billing permission on invoices and their files ──────────────────────

DROP POLICY IF EXISTS "Billing staff manage invoices" ON public.invoices;
CREATE POLICY "Billing staff manage invoices" ON public.invoices TO authenticated
  USING (public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'));

DROP POLICY IF EXISTS "Billing staff manage invoice items" ON public.invoice_items;
CREATE POLICY "Billing staff manage invoice items" ON public.invoice_items TO authenticated
  USING (public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'));

DROP POLICY IF EXISTS "Billing staff manage pdf versions" ON public.invoice_pdf_versions;
CREATE POLICY "Billing staff manage pdf versions" ON public.invoice_pdf_versions TO authenticated
  USING (public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'));

DROP POLICY IF EXISTS "Billing staff manage invoice pdf files" ON storage.objects;
CREATE POLICY "Billing staff manage invoice pdf files" ON storage.objects TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'))
  WITH CHECK (bucket_id = 'invoice-pdfs' AND public.has_role(auth.uid(), 'staff') AND public.has_permission(auth.uid(), 'billing'));

-- ─── 2. Tell billing when a project is ready to invoice ─────────────────────

CREATE OR REPLACE FUNCTION public.create_invoice_on_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invoice uuid;
  _subtotal numeric;
  _tax_rate numeric;
  _currency text;
  _label text := COALESCE(NEW.ref || ' · ', '') || NEW.title;
  -- Admins and managers bill as well as anyone given the Billing permission.
  _billing uuid[] := ARRAY(
    SELECT public.permission_holders('billing')
    UNION SELECT r.user_id FROM public.user_roles r WHERE r.role IN ('admin', 'manager')
  );
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed')
     AND NOT EXISTS (SELECT 1 FROM public.invoices WHERE job_id = NEW.id AND status <> 'cancelled') THEN
    IF NEW.client_id IS NULL THEN
      -- A walk-in with no client account can't get an invoice in the portal.
      PERFORM public.notify_users(_billing,
        'Ready to bill, no client account', _label || ': passed its quality check. Bill the customer outside the portal.',
        '/projects/' || NEW.id);
      RETURN NEW;
    END IF;

    SELECT COALESCE(default_tax_rate, 0), COALESCE(currency, 'USD') INTO _tax_rate, _currency FROM public.workshop_settings WHERE id = 1;
    SELECT COALESCE((SELECT q.currency FROM public.project_quotes q WHERE q.job_id = NEW.id AND q.status = 'accepted' AND q.currency IS NOT NULL LIMIT 1), _currency) INTO _currency;
    SELECT COALESCE(round(sum(i.quantity * i.unit_price), 2), 0) INTO _subtotal
      FROM public.project_quote_items i JOIN public.project_quotes q ON q.id = i.quote_id
      WHERE q.job_id = NEW.id AND q.status = 'accepted';

    INSERT INTO public.invoices (invoice_number, client_id, job_id, status, subtotal, tax_rate, tax_amount, total, currency)
    VALUES (
      'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4)),
      NEW.client_id, NEW.id, 'draft',
      _subtotal, COALESCE(_tax_rate, 0), round(_subtotal * COALESCE(_tax_rate, 0) / 100, 2), round(_subtotal * (1 + COALESCE(_tax_rate, 0) / 100), 2),
      COALESCE(_currency, 'USD')
    ) RETURNING id INTO _invoice;

    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    SELECT _invoice,
           CASE WHEN q.kind = 'change' THEN 'Change CR' || q.number || ': ' ELSE '' END || i.description,
           i.quantity, i.unit_price, round(i.quantity * i.unit_price, 2)
    FROM public.project_quote_items i JOIN public.project_quotes q ON q.id = i.quote_id
    WHERE q.job_id = NEW.id AND q.status = 'accepted'
    ORDER BY q.kind DESC, q.number, i.position;

    PERFORM public.notify_users(_billing,
      'Draft invoice ready to send',
      _label || CASE WHEN _subtotal > 0 THEN ': drafted from the accepted quote. Check it and send it.' ELSE ': no accepted quote, so add the lines before sending.' END,
      '/invoices/' || _invoice);
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 3. What Shipping can see about billing ─────────────────────────────────

-- The latest invoice on each project (none if not invoiced), for the shipping
-- and billing teams. Only status and total; no line items.
CREATE OR REPLACE FUNCTION public.project_billing_status(_job_ids uuid[])
RETURNS TABLE (job_id uuid, invoice_id uuid, invoice_number text, status text, total numeric, currency text, client_marked_paid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j AS job_id, i.id, i.invoice_number, i.status, i.total, i.currency, i.client_marked_paid_at IS NOT NULL
  FROM unnest(_job_ids) AS j
  LEFT JOIN LATERAL (
    SELECT * FROM public.invoices v
    WHERE v.job_id = j AND v.status <> 'cancelled'
    ORDER BY (v.status = 'paid') DESC, v.created_at DESC
    LIMIT 1
  ) i ON true
  WHERE public.has_permission(auth.uid(), 'shipping') OR public.has_permission(auth.uid(), 'billing')
$$;
REVOKE ALL ON FUNCTION public.project_billing_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_billing_status(uuid[]) TO authenticated;

-- Records why a machine left before it was paid for: a team note on the
-- project and a line in its activity.
CREATE OR REPLACE FUNCTION public.note_unpaid_handover(_job_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _why text := trim(COALESCE(_reason, ''));
BEGIN
  IF NOT public.has_permission(_uid, 'shipping') THEN
    RAISE EXCEPTION 'Only shipping can record a handover' USING ERRCODE = '42501';
  END IF;
  IF length(_why) = 0 THEN
    RAISE EXCEPTION 'Say why it is leaving before it is paid for' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.job_comments (job_id, user_id, body, is_internal)
  VALUES (_job_id, _uid, left('Handed over before payment: ' || _why, 2000), true);
  PERFORM public.add_project_event(_job_id, 'unpaid_handover', jsonb_build_object('reason', _why));
END;
$$;
REVOKE ALL ON FUNCTION public.note_unpaid_handover(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.note_unpaid_handover(uuid, text) TO authenticated;
