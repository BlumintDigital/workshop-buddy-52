CREATE TABLE IF NOT EXISTS public.dismissed_broadcasts (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, broadcast_id)
);
ALTER TABLE public.dismissed_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own dismissed_broadcasts"
  ON public.dismissed_broadcasts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.dismissed_notices (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notice_id uuid REFERENCES public.system_notices(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, notice_id)
);
ALTER TABLE public.dismissed_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own dismissed_notices"
  ON public.dismissed_notices FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
