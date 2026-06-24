CREATE TABLE IF NOT EXISTS public.monthly_revenue_goals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  year        INT NOT NULL,
  month       INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  goal_amount NUMERIC(10,2) NOT NULL,
  set_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(year, month)
);

ALTER TABLE public.monthly_revenue_goals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read past goals (Goals page needs this)
CREATE POLICY "select_authenticated" ON public.monthly_revenue_goals
  FOR SELECT TO authenticated USING (true);

-- Only admins/managers can insert — no UPDATE or DELETE, so goals are immutable once set
CREATE POLICY "insert_admin_manager" ON public.monthly_revenue_goals
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'manager')
    )
  );
