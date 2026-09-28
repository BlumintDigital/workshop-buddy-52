-- Accounting integrations: one provider-neutral layer that QuickBooks, Xero or
-- any other finance system plugs into.
--
-- Shoplane drafts invoices; the connected system can number and send them.
-- Changes are queued here and pushed by the `accounting` edge function, which
-- hands each job to the provider's adapter. Payments come back through
-- `accounting-webhook` (or a periodic status check) and mark invoices paid.
-- Only one system is active at a time. Nothing is queued when none is.

-- ─── Connections and their credentials ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounting_connections (
  provider text PRIMARY KEY CHECK (provider IN ('quickbooks', 'xero', 'webhook', 'test')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
  active boolean NOT NULL DEFAULT false,
  org_id text,
  org_name text,
  -- Mapping chosen at connect time: tax codes, the product or account lines
  -- post to, who numbers and sends invoices, where syncing starts from.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounting_connections_one_active ON public.accounting_connections (active) WHERE active;

-- Tokens and signing secrets. No policies: only the service role (the edge
-- functions) can read or write them.
CREATE TABLE IF NOT EXISTS public.accounting_secrets (
  provider text PRIMARY KEY REFERENCES public.accounting_connections(provider) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  webhook_secret text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Which Shoplane record is which record in the connected system.
CREATE TABLE IF NOT EXISTS public.accounting_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL REFERENCES public.accounting_connections(provider) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('customer', 'invoice', 'payment')),
  local_id uuid NOT NULL,
  external_id text NOT NULL,
  external_number text,
  external_url text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, entity_type, local_id),
  UNIQUE (provider, entity_type, external_id)
);

-- Work to do, and the record of what was done.
CREATE TABLE IF NOT EXISTS public.accounting_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL REFERENCES public.accounting_connections(provider) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('invoice', 'remote_invoice', 'remote_payment')),
  -- A Shoplane id for pushes, or the other system's id for pulls.
  local_id uuid,
  external_id text,
  action text NOT NULL CHECK (action IN ('upsert', 'void', 'payment', 'pull')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS accounting_queue_due ON public.accounting_queue (status, next_attempt_at);
-- One waiting job per record and action; a newer change just brings it forward.
CREATE UNIQUE INDEX IF NOT EXISTS accounting_queue_one_pending
  ON public.accounting_queue (provider, entity_type, COALESCE(local_id::text, external_id), action)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_secrets FROM anon, authenticated;

-- Admins, managers and billing staff can see the connection (never the
-- secrets), the links and the sync log. Changes go through the edge function.
CREATE OR REPLACE FUNCTION public.can_bill(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin') OR public.has_role(_uid, 'manager')
      OR (public.has_role(_uid, 'staff') AND public.has_permission(_uid, 'billing'))
$$;
REVOKE ALL ON FUNCTION public.can_bill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_bill(uuid) TO authenticated;

DROP POLICY IF EXISTS "Billing reads accounting connections" ON public.accounting_connections;
CREATE POLICY "Billing reads accounting connections" ON public.accounting_connections FOR SELECT TO authenticated USING (public.can_bill(auth.uid()));
DROP POLICY IF EXISTS "Billing reads accounting links" ON public.accounting_links;
CREATE POLICY "Billing reads accounting links" ON public.accounting_links FOR SELECT TO authenticated USING (public.can_bill(auth.uid()));
DROP POLICY IF EXISTS "Billing reads the sync log" ON public.accounting_queue;
CREATE POLICY "Billing reads the sync log" ON public.accounting_queue FOR SELECT TO authenticated USING (public.can_bill(auth.uid()));

INSERT INTO public.accounting_connections (provider) VALUES ('quickbooks'), ('xero'), ('webhook'), ('test') ON CONFLICT DO NOTHING;

-- ─── Queuing ────────────────────────────────────────────────────────────────

-- The connected system, if any.
CREATE OR REPLACE FUNCTION public.accounting_active_provider()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT provider FROM public.accounting_connections WHERE active AND status = 'connected' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.accounting_enqueue(_provider text, _entity text, _local uuid, _external text, _action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.accounting_queue (provider, entity_type, local_id, external_id, action)
  VALUES (_provider, _entity, _local, _external, _action)
  ON CONFLICT (provider, entity_type, COALESCE(local_id::text, external_id), action) WHERE status IN ('queued', 'running')
  DO UPDATE SET next_attempt_at = LEAST(accounting_queue.next_attempt_at, now());
END;
$$;
REVOKE ALL ON FUNCTION public.accounting_enqueue(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Invoice changes that the connected system needs to hear about. Updates made
-- by the sync itself (it sets app.accounting_source) are not echoed back.
CREATE OR REPLACE FUNCTION public.accounting_invoice_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p text := public.accounting_active_provider();
  _linked boolean;
  _since date;
BEGIN
  IF _p IS NULL OR current_setting('app.accounting_source', true) = _p THEN RETURN NEW; END IF;
  _since := NULLIF((SELECT settings->>'sync_from' FROM public.accounting_connections WHERE provider = _p), '')::date;
  IF _since IS NOT NULL AND NEW.created_at::date < _since THEN RETURN NEW; END IF;
  _linked := EXISTS (SELECT 1 FROM public.accounting_links WHERE provider = _p AND entity_type = 'invoice' AND local_id = NEW.id);

  IF NEW.status = 'cancelled' THEN
    IF _linked AND OLD.status IS DISTINCT FROM 'cancelled' THEN PERFORM public.accounting_enqueue(_p, 'invoice', NEW.id, NULL, 'void'); END IF;
  ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    -- Paid in Shoplane (cash, bank transfer): make sure it exists there, then record the payment.
    IF NOT _linked THEN PERFORM public.accounting_enqueue(_p, 'invoice', NEW.id, NULL, 'upsert'); END IF;
    PERFORM public.accounting_enqueue(_p, 'invoice', NEW.id, NULL, 'payment');
  ELSIF NEW.status IN ('sent', 'overdue') AND (NOT _linked OR (
      NEW.total, NEW.subtotal, NEW.tax_rate, NEW.due_date, NEW.discount_amount, NEW.notes, NEW.client_id, NEW.currency
    ) IS DISTINCT FROM (
      OLD.total, OLD.subtotal, OLD.tax_rate, OLD.due_date, OLD.discount_amount, OLD.notes, OLD.client_id, OLD.currency
    )) THEN
    PERFORM public.accounting_enqueue(_p, 'invoice', NEW.id, NULL, 'upsert');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invoices_accounting_sync ON public.invoices;
CREATE TRIGGER invoices_accounting_sync AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.accounting_invoice_changed();

-- Line changes on an invoice that's already there.
CREATE OR REPLACE FUNCTION public.accounting_invoice_items_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p text := public.accounting_active_provider();
  _invoice uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  IF _p IS NULL OR current_setting('app.accounting_source', true) = _p THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.accounting_links WHERE provider = _p AND entity_type = 'invoice' AND local_id = _invoice)
     AND EXISTS (SELECT 1 FROM public.invoices WHERE id = _invoice AND status IN ('sent', 'overdue')) THEN
    PERFORM public.accounting_enqueue(_p, 'invoice', _invoice, NULL, 'upsert');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS invoice_items_accounting_sync ON public.invoice_items;
CREATE TRIGGER invoice_items_accounting_sync AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.accounting_invoice_items_changed();

-- ─── For the app ────────────────────────────────────────────────────────────

-- Sync now / retry for one invoice (admins, managers, billing staff).
CREATE OR REPLACE FUNCTION public.accounting_sync_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p text := public.accounting_active_provider();
BEGIN
  IF NOT public.can_bill(auth.uid()) THEN RAISE EXCEPTION 'You can''t sync invoices' USING ERRCODE = '42501'; END IF;
  IF _p IS NULL THEN RAISE EXCEPTION 'No accounting system is connected' USING ERRCODE = '22023'; END IF;
  UPDATE public.accounting_queue SET status = 'queued', next_attempt_at = now(), attempts = 0
    WHERE provider = _p AND entity_type = 'invoice' AND local_id = _invoice_id AND status = 'failed'
      AND NOT EXISTS (SELECT 1 FROM public.accounting_queue q WHERE q.provider = _p AND q.entity_type = 'invoice' AND q.local_id = _invoice_id AND q.status IN ('queued', 'running'));
  IF NOT FOUND THEN PERFORM public.accounting_enqueue(_p, 'invoice', _invoice_id, NULL, 'upsert'); END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.accounting_sync_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_sync_invoice(uuid) TO authenticated;

-- Where an invoice stands in the connected system.
CREATE OR REPLACE FUNCTION public.accounting_invoice_status(_invoice_id uuid)
RETURNS TABLE (provider text, org_name text, external_number text, external_url text, synced_at timestamptz,
               job_status text, job_error text, job_attempts int, send_from text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.provider, c.org_name, l.external_number, l.external_url, l.synced_at,
         q.status, q.last_error, q.attempts, COALESCE(c.settings->>'send_from', 'shoplane')
  FROM public.accounting_connections c
  LEFT JOIN public.accounting_links l ON l.provider = c.provider AND l.entity_type = 'invoice' AND l.local_id = _invoice_id
  LEFT JOIN LATERAL (
    SELECT status, last_error, attempts FROM public.accounting_queue
    WHERE provider = c.provider AND entity_type = 'invoice' AND local_id = _invoice_id
    ORDER BY created_at DESC LIMIT 1
  ) q ON true
  WHERE c.active AND c.status = 'connected' AND public.can_bill(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.accounting_invoice_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_invoice_status(uuid) TO authenticated;

-- For the worker: take up to _limit due jobs for the active system.
CREATE OR REPLACE FUNCTION public.accounting_claim_jobs(_limit int)
RETURNS SETOF public.accounting_queue LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.accounting_queue q SET status = 'running', attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.accounting_queue
    WHERE status = 'queued' AND next_attempt_at <= now() AND provider = public.accounting_active_provider()
    ORDER BY id LIMIT _limit FOR UPDATE SKIP LOCKED
  )
  RETURNING q.*
$$;
REVOKE ALL ON FUNCTION public.accounting_claim_jobs(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_active_provider() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_active_provider() TO authenticated;

-- For the worker: record a payment that happened in the connected system,
-- without queuing it straight back there.
CREATE OR REPLACE FUNCTION public.accounting_mark_paid(_provider text, _invoice_id uuid, _paid_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.accounting_source', _provider, true);
  UPDATE public.invoices SET status = 'paid', paid_at = COALESCE(_paid_at, now()), updated_at = now()
    WHERE id = _invoice_id AND status <> 'paid' AND status <> 'cancelled';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.accounting_mark_paid(text, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Reset and backups: the connection and its log are workshop setup and data.
CREATE OR REPLACE FUNCTION public.workshop_data_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT ARRAY[
    'suppliers', 'inventory_items',
    'client_requests', 'request_quote_items',
    'jobs', 'project_ref_counters',
    'job_tasks', 'job_task_notes', 'job_comments', 'job_attachments', 'job_ratings',
    'project_events', 'project_quotes', 'project_quote_items',
    'task_handoffs', 'time_entries', 'shipments',
    'stock_requests', 'stock_request_items', 'purchase_orders', 'purchase_order_items',
    'invoices', 'invoice_items', 'invoice_pdf_versions', 'inventory_transactions',
    'appointments', 'notifications', 'bug_reports',
    'accounting_links', 'accounting_queue'
  ]::text[]
$$;
