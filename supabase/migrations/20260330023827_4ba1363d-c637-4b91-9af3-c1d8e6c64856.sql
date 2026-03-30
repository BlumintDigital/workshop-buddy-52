ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can view roles" ON public.user_roles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));