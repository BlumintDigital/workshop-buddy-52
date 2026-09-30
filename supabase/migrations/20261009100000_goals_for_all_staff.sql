-- Goals is a screen for the whole workshop floor: every internal user (admin,
-- manager, staff) can read the month's goal. Setting it stays with admins and
-- managers. The restrictive "Feature gate goals" and 2FA policies still apply.
DROP POLICY IF EXISTS "select_admin_manager" ON public.monthly_revenue_goals;
DROP POLICY IF EXISTS "Internal users can view goals" ON public.monthly_revenue_goals;
CREATE POLICY "Internal users can view goals" ON public.monthly_revenue_goals
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'staff'::public.app_role)
  );
