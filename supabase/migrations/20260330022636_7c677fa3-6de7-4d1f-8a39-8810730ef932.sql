
-- 1. Add stripe_payment_url to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_payment_url text;

-- 2. Trigger: auto-create draft invoice when job completed
CREATE OR REPLACE FUNCTION public.create_invoice_on_job_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.invoices (invoice_number, client_id, job_id, status, subtotal, tax_rate, tax_amount, total)
    VALUES (
      'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 4),
      NEW.client_id,
      NEW.id,
      'draft',
      0, 0, 0, 0
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_job_completed_create_invoice
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_invoice_on_job_completed();

-- 3. RPC: Monthly bookings
CREATE OR REPLACE FUNCTION public.get_monthly_bookings()
RETURNS TABLE(month text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(appointment_date::timestamp, 'YYYY-MM') AS month, count(*)
  FROM appointments
  WHERE appointment_date >= (now() - interval '12 months')::date
  GROUP BY month ORDER BY month;
$$;

-- 4. RPC: Monthly revenue
CREATE OR REPLACE FUNCTION public.get_monthly_revenue()
RETURNS TABLE(month text, revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(paid_at, 'YYYY-MM') AS month, sum(total) AS revenue
  FROM invoices
  WHERE status = 'paid' AND paid_at >= (now() - interval '12 months')
  GROUP BY month ORDER BY month;
$$;

-- 5. RPC: Job completion stats
CREATE OR REPLACE FUNCTION public.get_job_completion_stats()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status, count(*) FROM jobs GROUP BY status;
$$;
