-- Projects, phase D: the inventory portal.
-- Parts requests against projects, issuing and returning parts, suppliers,
-- purchase orders with approval limits, and receiving goods into stock.
--
-- Additive. The app on main keeps its direct stock updates until it's retired.

-- ─── 1. Suppliers and richer stock items ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  contact_name text,
  email text,
  phone text,
  address text,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key ON public.suppliers (lower(trim(name)));
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS reorder_quantity numeric CHECK (reorder_quantity IS NULL OR reorder_quantity >= 0);

-- Managers approve purchase orders up to this amount; admins approve any amount.
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS purchase_manager_limit numeric NOT NULL DEFAULT 1000 CHECK (purchase_manager_limit >= 0);

-- Whoever runs stores: the inventory team (admins and managers always).
CREATE OR REPLACE FUNCTION public.is_storekeeper(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_permission(_user_id, 'inventory');
$$;

DROP POLICY IF EXISTS "Stores reads suppliers" ON public.suppliers;
CREATE POLICY "Stores reads suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (public.is_storekeeper(auth.uid()) OR public.has_permission(auth.uid(), 'inventory_approve'));
DROP POLICY IF EXISTS "Stores manages suppliers" ON public.suppliers;
CREATE POLICY "Stores manages suppliers" ON public.suppliers
  FOR ALL TO authenticated USING (public.is_storekeeper(auth.uid())) WITH CHECK (public.is_storekeeper(auth.uid()));

DROP POLICY IF EXISTS "Stores manages stock" ON public.inventory_items;
CREATE POLICY "Stores manages stock" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.is_storekeeper(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.is_storekeeper(auth.uid()));
DROP POLICY IF EXISTS "Stores records movements" ON public.inventory_transactions;
CREATE POLICY "Stores records movements" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.is_storekeeper(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'staff'::public.app_role) AND public.is_storekeeper(auth.uid()));
-- The team sees the parts used on projects they work on.
DROP POLICY IF EXISTS "Team sees parts on their projects" ON public.inventory_transactions;
CREATE POLICY "Team sees parts on their projects" ON public.inventory_transactions
  FOR SELECT TO authenticated USING (job_id IS NOT NULL AND NOT public.has_role(auth.uid(), 'client'::public.app_role) AND public.can_view_job(auth.uid(), job_id));

-- ─── 2. Parts requests ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.job_tasks(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'fulfilled', 'cancelled')),
  needed_by date,
  notes text CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_requests_job_idx ON public.stock_requests (job_id);
CREATE INDEX IF NOT EXISTS stock_requests_status_idx ON public.stock_requests (status);
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS stock_requests_set_updated_at ON public.stock_requests;
CREATE TRIGGER stock_requests_set_updated_at BEFORE UPDATE ON public.stock_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.stock_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.stock_requests(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  quantity numeric NOT NULL CHECK (quantity > 0),
  quantity_issued numeric NOT NULL DEFAULT 0 CHECK (quantity_issued >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ordering', 'issued', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_request_items_request_idx ON public.stock_request_items (request_id);
ALTER TABLE public.stock_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team and stores read parts requests" ON public.stock_requests;
CREATE POLICY "Team and stores read parts requests" ON public.stock_requests
  FOR SELECT TO authenticated USING (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND (public.is_storekeeper(auth.uid()) OR public.can_view_job(auth.uid(), job_id))
  );
DROP POLICY IF EXISTS "Stores updates parts requests" ON public.stock_requests;
CREATE POLICY "Stores updates parts requests" ON public.stock_requests
  FOR UPDATE TO authenticated USING (public.is_storekeeper(auth.uid())) WITH CHECK (public.is_storekeeper(auth.uid()));
DROP POLICY IF EXISTS "Read request lines with their request" ON public.stock_request_items;
CREATE POLICY "Read request lines with their request" ON public.stock_request_items
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.stock_requests r WHERE r.id = stock_request_items.request_id));
DROP POLICY IF EXISTS "Stores updates request lines" ON public.stock_request_items;
CREATE POLICY "Stores updates request lines" ON public.stock_request_items
  FOR UPDATE TO authenticated USING (public.is_storekeeper(auth.uid())) WITH CHECK (public.is_storekeeper(auth.uid()));

-- Anyone working on a project (not clients) asks stores for parts.
CREATE OR REPLACE FUNCTION public.request_parts(_job_id uuid, _items jsonb, _notes text DEFAULT NULL, _needed_by date DEFAULT NULL, _task_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _item jsonb;
  _job public.jobs%ROWTYPE;
  _summary text;
BEGIN
  IF _uid IS NULL OR public.has_role(_uid, 'client'::public.app_role) OR NOT public.can_view_job(_uid, _job_id) THEN
    RAISE EXCEPTION 'You can''t request parts for this project' USING ERRCODE = '42501';
  END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Add at least one part' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;

  INSERT INTO public.stock_requests (job_id, task_id, requested_by, needed_by, notes)
  VALUES (_job_id, _task_id, _uid, _needed_by, NULLIF(trim(COALESCE(_notes, '')), ''))
  RETURNING id INTO _id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.stock_request_items (request_id, item_id, description, quantity)
    VALUES (
      _id,
      NULLIF(_item->>'item_id', '')::uuid,
      COALESCE(NULLIF(trim(_item->>'description'), ''), (SELECT name FROM public.inventory_items WHERE id = NULLIF(_item->>'item_id', '')::uuid), 'Part'),
      COALESCE((_item->>'quantity')::numeric, 1)
    );
  END LOOP;

  SELECT string_agg(description || ' × ' || trim(to_char(quantity, 'FM999999990.##')), ', ') INTO _summary FROM public.stock_request_items WHERE request_id = _id;
  PERFORM public.add_project_event(_job_id, 'parts_requested', jsonb_build_object('summary', left(_summary, 200)));
  PERFORM public.notify_users(ARRAY(SELECT public.permission_holders('inventory')),
    'Parts requested for ' || _job.ref, left(_summary, 160), '/inventory');
  RETURN _id;
END;
$$;

-- Recompute a request's status from its lines.
CREATE OR REPLACE FUNCTION public.refresh_stock_request(_request_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.stock_requests r SET status = CASE
    WHEN r.status = 'cancelled' THEN 'cancelled'
    WHEN NOT EXISTS (SELECT 1 FROM public.stock_request_items i WHERE i.request_id = r.id AND i.status NOT IN ('issued', 'cancelled')) THEN 'fulfilled'
    WHEN EXISTS (SELECT 1 FROM public.stock_request_items i WHERE i.request_id = r.id AND i.quantity_issued > 0) THEN 'partial'
    ELSE 'open' END
  WHERE r.id = _request_id;
$$;
REVOKE ALL ON FUNCTION public.refresh_stock_request(uuid) FROM PUBLIC, anon, authenticated;

-- Stores hands parts over: stock goes down, the project carries the cost.
CREATE OR REPLACE FUNCTION public.issue_parts(_request_item_id uuid, _quantity numeric, _item_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _line public.stock_request_items%ROWTYPE;
  _req public.stock_requests%ROWTYPE;
  _stock public.inventory_items%ROWTYPE;
  _job public.jobs%ROWTYPE;
BEGIN
  IF NOT public.is_storekeeper(_uid) THEN RAISE EXCEPTION 'Only stores can issue parts' USING ERRCODE = '42501'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Enter how many to issue' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _line FROM public.stock_request_items WHERE id = _request_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request line not found' USING ERRCODE = 'P0002'; END IF;
  IF _line.status IN ('issued', 'cancelled') THEN RAISE EXCEPTION 'This line is already closed' USING ERRCODE = '22023'; END IF;
  IF _item_id IS NOT NULL THEN
    UPDATE public.stock_request_items SET item_id = _item_id WHERE id = _line.id;
    _line.item_id := _item_id;
  END IF;
  IF _line.item_id IS NULL THEN RAISE EXCEPTION 'Pick the stock item to issue' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _stock FROM public.inventory_items WHERE id = _line.item_id FOR UPDATE;
  IF _stock.quantity < _quantity THEN
    RAISE EXCEPTION 'Only % % in stock', trim(to_char(_stock.quantity, 'FM999999990.##')), _stock.unit USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _req FROM public.stock_requests WHERE id = _line.request_id;
  SELECT * INTO _job FROM public.jobs WHERE id = _req.job_id;

  UPDATE public.inventory_items SET quantity = quantity - _quantity WHERE id = _stock.id;
  INSERT INTO public.inventory_transactions (item_id, job_id, user_id, type, quantity, notes)
  VALUES (_stock.id, _req.job_id, _uid, 'out', _quantity, 'Issued for ' || _job.ref);
  UPDATE public.stock_request_items
    SET quantity_issued = quantity_issued + _quantity,
        status = CASE WHEN quantity_issued + _quantity >= quantity THEN 'issued' ELSE status END
    WHERE id = _line.id;
  PERFORM public.refresh_stock_request(_req.id);
  PERFORM public.add_project_event(_req.job_id, 'parts_issued',
    jsonb_build_object('summary', _stock.name || ' × ' || trim(to_char(_quantity, 'FM999999990.##'))));
  PERFORM public.notify_users(ARRAY[_req.requested_by], 'Parts ready: ' || _stock.name, _job.ref || ' · ' || trim(to_char(_quantity, 'FM999999990.##')) || ' ' || _stock.unit, '/projects/' || _req.job_id);
END;
$$;

-- Unused parts come back into stock and off the project.
CREATE OR REPLACE FUNCTION public.return_parts(_job_id uuid, _item_id uuid, _quantity numeric, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _out numeric;
  _ref text;
BEGIN
  IF NOT public.is_storekeeper(auth.uid()) THEN RAISE EXCEPTION 'Only stores can take parts back' USING ERRCODE = '42501'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Enter how many came back' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(CASE WHEN type = 'out' THEN quantity WHEN type = 'in' THEN -quantity ELSE 0 END), 0) INTO _out
    FROM public.inventory_transactions WHERE job_id = _job_id AND item_id = _item_id;
  IF _quantity > _out THEN RAISE EXCEPTION 'Only % were issued to this project', trim(to_char(_out, 'FM999999990.##')) USING ERRCODE = '22023'; END IF;
  SELECT ref INTO _ref FROM public.jobs WHERE id = _job_id;
  UPDATE public.inventory_items SET quantity = quantity + _quantity WHERE id = _item_id;
  INSERT INTO public.inventory_transactions (item_id, job_id, user_id, type, quantity, notes)
  VALUES (_item_id, _job_id, auth.uid(), 'in', _quantity, COALESCE(NULLIF(trim(COALESCE(_note, '')), ''), 'Returned from ' || _ref));
END;
$$;

-- ─── 3. Purchase orders ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL DEFAULT '',
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'ordered', 'received', 'cancelled')),
  currency text,
  subtotal numeric NOT NULL DEFAULT 0,
  quote_file_path text,
  quote_file_name text,
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  expected_at date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  decision_note text,
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_number_key ON public.purchase_orders (po_number) WHERE po_number <> '';
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON public.purchase_orders (status);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_set_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  request_item_id uuid REFERENCES public.stock_request_items(id) ON DELETE SET NULL,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  quantity_received numeric NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON public.purchase_order_items (po_id, position);
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- PO-202609-001: numbered by month, like project IDs.
CREATE OR REPLACE FUNCTION public.purchase_orders_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _period text := to_char(now() AT TIME ZONE 'UTC', 'YYYYMM');
  _n integer;
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    INSERT INTO public.project_ref_counters AS c (period, last_value) VALUES ('P' || _period, 1)
    ON CONFLICT (period) DO UPDATE SET last_value = c.last_value + 1
    RETURNING last_value INTO _n;
    NEW.po_number := 'PO-' || _period || '-' || CASE WHEN _n < 1000 THEN lpad(_n::text, 3, '0') ELSE _n::text END;
  END IF;
  RETURN NEW;
END;
$$;
-- The counters table only allowed six-digit periods; purchase orders use a P prefix.
ALTER TABLE public.project_ref_counters DROP CONSTRAINT IF EXISTS project_ref_counters_period_check;
ALTER TABLE public.project_ref_counters ADD CONSTRAINT project_ref_counters_period_check CHECK (period ~ '^P?[0-9]{6}$');
DROP TRIGGER IF EXISTS purchase_orders_number ON public.purchase_orders;
CREATE TRIGGER purchase_orders_number BEFORE INSERT ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_number();

CREATE OR REPLACE FUNCTION public.purchase_order_items_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _po uuid := COALESCE(NEW.po_id, OLD.po_id);
BEGIN
  UPDATE public.purchase_orders
    SET subtotal = (SELECT COALESCE(round(sum(quantity * unit_cost), 2), 0) FROM public.purchase_order_items WHERE po_id = _po)
    WHERE id = _po;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS purchase_order_items_total ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_total AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_total();

DROP POLICY IF EXISTS "Stores and approvers read purchase orders" ON public.purchase_orders;
CREATE POLICY "Stores and approvers read purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.is_storekeeper(auth.uid()) OR public.has_permission(auth.uid(), 'inventory_approve'));
DROP POLICY IF EXISTS "Stores drafts purchase orders" ON public.purchase_orders;
CREATE POLICY "Stores drafts purchase orders" ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (public.is_storekeeper(auth.uid()) AND status = 'draft');
DROP POLICY IF EXISTS "Stores edits draft purchase orders" ON public.purchase_orders;
CREATE POLICY "Stores edits draft purchase orders" ON public.purchase_orders
  FOR UPDATE TO authenticated USING (public.is_storekeeper(auth.uid()) AND status = 'draft') WITH CHECK (status = 'draft');
DROP POLICY IF EXISTS "Stores deletes draft purchase orders" ON public.purchase_orders;
CREATE POLICY "Stores deletes draft purchase orders" ON public.purchase_orders
  FOR DELETE TO authenticated USING (public.is_storekeeper(auth.uid()) AND status = 'draft');

DROP POLICY IF EXISTS "Read order lines with their order" ON public.purchase_order_items;
CREATE POLICY "Read order lines with their order" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_items.po_id));
DROP POLICY IF EXISTS "Edit lines of draft orders" ON public.purchase_order_items;
CREATE POLICY "Edit lines of draft orders" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (public.is_storekeeper(auth.uid()) AND EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_items.po_id AND p.status = 'draft'))
  WITH CHECK (public.is_storekeeper(auth.uid()) AND EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_items.po_id AND p.status = 'draft'));

-- Who may approve an order of this size: admins always; other approvers up to the limit.
CREATE OR REPLACE FUNCTION public.can_approve_purchase(_user_id uuid, _amount numeric)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR (public.has_permission(_user_id, 'inventory_approve')
          AND _amount <= COALESCE((SELECT purchase_manager_limit FROM public.workshop_settings WHERE id = 1), 0));
$$;

CREATE OR REPLACE FUNCTION public.submit_purchase_order(_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _po public.purchase_orders%ROWTYPE;
  _limit numeric;
  _approvers uuid[];
BEGIN
  IF NOT public.is_storekeeper(auth.uid()) THEN RAISE EXCEPTION 'Only stores can submit purchase orders' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = 'P0002'; END IF;
  IF _po.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be submitted' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE po_id = _po_id) THEN RAISE EXCEPTION 'Add at least one line' USING ERRCODE = '22023'; END IF;
  UPDATE public.purchase_orders SET status = 'pending_approval' WHERE id = _po_id;

  SELECT COALESCE(purchase_manager_limit, 0) INTO _limit FROM public.workshop_settings WHERE id = 1;
  _approvers := ARRAY(SELECT user_id FROM public.user_roles WHERE role = 'admin');
  IF _po.subtotal <= _limit THEN
    _approvers := _approvers || ARRAY(SELECT user_id FROM public.user_roles WHERE role = 'manager') || ARRAY(SELECT public.permission_holders('inventory_approve'));
  END IF;
  PERFORM public.notify_users(_approvers, 'Purchase to approve: ' || _po.po_number,
    trim(to_char(_po.subtotal, 'FM999999990.00')) || ' ' || COALESCE(_po.currency, ''), '/inventory/purchases');
  RETURN 'pending_approval';
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_purchase_order(_po_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = 'P0002'; END IF;
  IF _po.status <> 'pending_approval' THEN RAISE EXCEPTION 'This order isn''t waiting for approval' USING ERRCODE = '22023'; END IF;
  IF NOT public.can_approve_purchase(_uid, _po.subtotal) THEN
    RAISE EXCEPTION 'This order is over your approval limit. An admin needs to approve it.' USING ERRCODE = '42501';
  END IF;
  IF NOT _approve AND (_note IS NULL OR length(trim(_note)) = 0) THEN RAISE EXCEPTION 'Say why it''s rejected' USING ERRCODE = '22023'; END IF;
  UPDATE public.purchase_orders
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        approved_by = _uid, approved_at = now(), decision_note = NULLIF(trim(COALESCE(_note, '')), '')
    WHERE id = _po_id;
  PERFORM public.notify_users(ARRAY[_po.created_by],
    CASE WHEN _approve THEN 'Approved: ' ELSE 'Rejected: ' END || _po.po_number,
    COALESCE(NULLIF(trim(COALESCE(_note, '')), ''), CASE WHEN _approve THEN 'You can place the order.' ELSE '' END), '/inventory/purchases');
  RETURN CASE WHEN _approve THEN 'approved' ELSE 'rejected' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_purchase_ordered(_po_id uuid, _expected date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_storekeeper(auth.uid()) THEN RAISE EXCEPTION 'Only stores can place orders' USING ERRCODE = '42501'; END IF;
  UPDATE public.purchase_orders SET status = 'ordered', ordered_at = now(), expected_at = COALESCE(_expected, expected_at)
    WHERE id = _po_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an approved order can be placed' USING ERRCODE = '22023'; END IF;
  UPDATE public.stock_request_items SET status = 'ordering'
    WHERE id IN (SELECT request_item_id FROM public.purchase_order_items WHERE po_id = _po_id AND request_item_id IS NOT NULL) AND status = 'open';
END;
$$;

-- Goods in: stock goes up at a weighted average cost. Lines with no stock
-- item become new stock items.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(_po_id uuid, _lines jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _po public.purchase_orders%ROWTYPE;
  _l jsonb;
  _line public.purchase_order_items%ROWTYPE;
  _qty numeric;
  _item uuid;
  _stock public.inventory_items%ROWTYPE;
  _notify uuid[] := '{}';
BEGIN
  IF NOT public.is_storekeeper(_uid) THEN RAISE EXCEPTION 'Only stores can receive goods' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found' USING ERRCODE = 'P0002'; END IF;
  IF _po.status NOT IN ('approved', 'ordered') THEN RAISE EXCEPTION 'Only an approved or ordered purchase can be received' USING ERRCODE = '22023'; END IF;

  FOR _l IN SELECT * FROM jsonb_array_elements(COALESCE(_lines, '[]'::jsonb)) LOOP
    _qty := COALESCE((_l->>'quantity')::numeric, 0);
    CONTINUE WHEN _qty <= 0;
    SELECT * INTO _line FROM public.purchase_order_items WHERE id = (_l->>'line_id')::uuid AND po_id = _po_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    _item := _line.item_id;
    IF _item IS NULL THEN
      INSERT INTO public.inventory_items (name, unit, unit_cost, quantity, min_stock, supplier_id)
      VALUES (left(_line.description, 200), 'pcs', _line.unit_cost, 0, 0, _po.supplier_id)
      RETURNING id INTO _item;
      UPDATE public.purchase_order_items SET item_id = _item WHERE id = _line.id;
      IF _line.request_item_id IS NOT NULL THEN
        UPDATE public.stock_request_items SET item_id = _item WHERE id = _line.request_item_id AND item_id IS NULL;
      END IF;
    END IF;
    SELECT * INTO _stock FROM public.inventory_items WHERE id = _item FOR UPDATE;
    UPDATE public.inventory_items
      SET unit_cost = CASE WHEN _stock.quantity + _qty > 0
                           THEN round((GREATEST(_stock.quantity, 0) * _stock.unit_cost + _qty * _line.unit_cost) / (GREATEST(_stock.quantity, 0) + _qty), 4)
                           ELSE _line.unit_cost END,
          quantity = quantity + _qty
      WHERE id = _item;
    INSERT INTO public.inventory_transactions (item_id, user_id, type, quantity, notes)
    VALUES (_item, _uid, 'in', _qty, 'Received on ' || _po.po_number);
    UPDATE public.purchase_order_items SET quantity_received = quantity_received + _qty WHERE id = _line.id;
    IF _line.request_item_id IS NOT NULL THEN
      UPDATE public.stock_request_items SET status = 'open' WHERE id = _line.request_item_id AND status = 'ordering';
      _notify := _notify || ARRAY(SELECT r.requested_by FROM public.stock_requests r JOIN public.stock_request_items i ON i.request_id = r.id WHERE i.id = _line.request_item_id);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.purchase_order_items WHERE po_id = _po_id AND quantity_received < quantity) THEN
    UPDATE public.purchase_orders SET status = 'received', received_at = now() WHERE id = _po_id;
  ELSE
    UPDATE public.purchase_orders SET status = 'ordered', ordered_at = COALESCE(ordered_at, now()) WHERE id = _po_id;
  END IF;
  IF array_length(_notify, 1) > 0 THEN
    PERFORM public.notify_users(_notify, 'Ordered parts have arrived', _po.po_number || ': stores will issue them to your project.', '/inventory');
  END IF;
  RETURN (SELECT status FROM public.purchase_orders WHERE id = _po_id);
END;
$$;

-- ─── 4. Supplier quote files ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES ('inventory-docs', 'inventory-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Stores and approvers read inventory documents" ON storage.objects;
CREATE POLICY "Stores and approvers read inventory documents" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'inventory-docs' AND (public.is_storekeeper(auth.uid()) OR public.has_permission(auth.uid(), 'inventory_approve'))
  );
DROP POLICY IF EXISTS "Stores uploads inventory documents" ON storage.objects;
CREATE POLICY "Stores uploads inventory documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'inventory-docs' AND public.is_storekeeper(auth.uid()));
DROP POLICY IF EXISTS "Stores removes inventory documents" ON storage.objects;
CREATE POLICY "Stores removes inventory documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'inventory-docs' AND public.is_storekeeper(auth.uid()));

-- ─── 5. Access to the new functions ─────────────────────────────────────────

REVOKE ALL ON FUNCTION public.request_parts(uuid, jsonb, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_parts(uuid, jsonb, text, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.issue_parts(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_parts(uuid, numeric, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.return_parts(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_parts(uuid, uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_purchase_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.decide_purchase_order(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_purchase_order(uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_purchase_ordered(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_purchase_ordered(uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.can_approve_purchase(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_purchase(uuid, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.is_storekeeper(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_storekeeper(uuid) TO authenticated;
