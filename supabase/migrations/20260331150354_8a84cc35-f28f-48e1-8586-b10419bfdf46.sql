-- Add back anon SELECT so login page can read branding
CREATE POLICY "Anon can read workshop settings" ON public.workshop_settings
  FOR SELECT TO anon
  USING (true);