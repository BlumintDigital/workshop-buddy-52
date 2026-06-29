-- Workshop: list of currencies allowed on invoices
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS enabled_currencies text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.workshop_settings
SET enabled_currencies = ARRAY[COALESCE(currency, 'USD')]
WHERE cardinality(enabled_currencies) = 0;

-- Invoices: per-row currency + fx rate to base, plus generated base_total
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric NOT NULL DEFAULT 1;

UPDATE public.invoices i
SET currency = COALESCE(i.currency, (SELECT currency FROM public.workshop_settings WHERE id = 1), 'USD')
WHERE i.currency IS NULL;

ALTER TABLE public.invoices
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'USD';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS base_total numeric GENERATED ALWAYS AS (total * fx_rate) STORED;

-- Reports: sum in base currency
CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
 RETURNS TABLE(month text, revenue numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_feature_enabled('reports') THEN
    RAISE EXCEPTION 'Reports feature is disabled' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT to_char(i.paid_at, 'YYYY-MM'), sum(i.base_total)
    FROM public.invoices i
    WHERE i.status = 'paid' AND i.paid_at >= (now() - interval '12 months')
    GROUP BY 1 ORDER BY 1;
END;
$function$;