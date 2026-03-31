-- Fix inventory_items RLS policies with explicit WITH CHECK
DROP POLICY "Admins can manage inventory" ON public.inventory_items;
CREATE POLICY "Admins can manage inventory" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Managers can manage inventory" ON public.inventory_items;
CREATE POLICY "Managers can manage inventory" ON public.inventory_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update inventory quantity" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff'))
  WITH CHECK (public.has_role(auth.uid(), 'staff'));

-- Fix inventory_transactions RLS policies with explicit WITH CHECK
DROP POLICY "Admins can manage inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Admins can manage inventory transactions" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY "Managers can manage inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Managers can manage inventory transactions" ON public.inventory_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));