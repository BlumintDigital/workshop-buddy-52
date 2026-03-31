CREATE POLICY "Anyone can read workshop settings"
ON public.workshop_settings
FOR SELECT
TO public
USING (true);