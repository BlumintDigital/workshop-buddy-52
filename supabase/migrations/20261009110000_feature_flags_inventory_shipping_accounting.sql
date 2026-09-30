-- Three more parts of Shoplane a workshop can go without: Inventory, Shipping
-- and Accounting sync. Existing workshops keep them (their rows start on);
-- the command centre picks them for new customers.

-- 1. Allowed switch names.
ALTER TABLE public.feature_flags DROP CONSTRAINT IF EXISTS feature_flags_key_check;
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_key_check CHECK (key = ANY (ARRAY[
  'appointments', 'client_portal', 'goals', 'reports', 'job_chat',
  'inventory', 'shipping', 'accounting_sync',
  'generate_sample_data', 'setup_demo_users', 'backup_restore'
]));

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('inventory', true), ('shipping', true), ('accounting_sync', true)
ON CONFLICT (key) DO NOTHING;

-- 2. Modules default on when their row is missing; operator tools default off.
CREATE OR REPLACE FUNCTION public.is_feature_enabled(feature_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN feature_key IN ('appointments','client_portal','goals','reports','job_chat','inventory','shipping','accounting_sync')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), true)
    WHEN feature_key IN ('generate_sample_data','setup_demo_users','backup_restore')
      THEN COALESCE((SELECT enabled FROM public.feature_flags WHERE key = feature_key), false)
    ELSE false
  END;
$$;

-- 3. When a module is off, signed-in users can't read or change its data.
--    Server-side functions (definer, service role) are unaffected.
DO $$
DECLARE
  gate record;
BEGIN
  FOR gate IN
    SELECT * FROM (VALUES
      ('inventory', 'inventory_items'), ('inventory', 'inventory_transactions'),
      ('inventory', 'stock_requests'), ('inventory', 'stock_request_items'),
      ('inventory', 'purchase_orders'), ('inventory', 'purchase_order_items'),
      ('inventory', 'suppliers'),
      ('shipping', 'shipments'),
      ('accounting_sync', 'accounting_connections'), ('accounting_sync', 'accounting_links'),
      ('accounting_sync', 'accounting_queue')
    ) AS g(feature, tbl)
  LOOP
    IF to_regclass('public.' || gate.tbl) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Feature gate ' || gate.feature, gate.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_feature_enabled(%L)) WITH CHECK (public.is_feature_enabled(%L))',
      'Feature gate ' || gate.feature, gate.tbl, gate.feature, gate.feature
    );
  END LOOP;
END $$;

-- 4. With Accounting sync off there is no connected system: invoice changes
--    aren't queued and the sync worker finds nothing to do.
CREATE OR REPLACE FUNCTION public.accounting_active_provider()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT provider FROM public.accounting_connections
  WHERE active AND status = 'connected' AND public.is_feature_enabled('accounting_sync')
  LIMIT 1
$$;
