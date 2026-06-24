
DROP POLICY IF EXISTS "Staff can view all appointments" ON public.appointments;
CREATE POLICY "Staff can view appointments for assigned clients"
ON public.appointments FOR SELECT
USING (
  has_role(auth.uid(), 'staff'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.assigned_staff_id = auth.uid()
      AND j.client_id = appointments.client_id
  )
);

DROP POLICY IF EXISTS "Staff can view invoices" ON public.invoices;
CREATE POLICY "Staff can view assigned invoices"
ON public.invoices FOR SELECT
USING (
  has_role(auth.uid(), 'staff'::app_role)
  AND job_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = invoices.job_id
      AND j.assigned_staff_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Staff can view invoice items" ON public.invoice_items;
CREATE POLICY "Staff can view assigned invoice items"
ON public.invoice_items FOR SELECT
USING (
  has_role(auth.uid(), 'staff'::app_role)
  AND EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.jobs j ON j.id = i.job_id
    WHERE i.id = invoice_items.invoice_id
      AND j.assigned_staff_id = auth.uid()
  )
);

REVOKE EXECUTE ON FUNCTION public.get_monthly_revenue() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_monthly_bookings() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_job_completion_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_signup_code(text) FROM PUBLIC, anon;
