-- Delete all test data (clear dismissals first to respect FK constraints)
DELETE FROM public.dismissed_broadcasts;
DELETE FROM public.dismissed_notices;
DELETE FROM public.broadcasts;
DELETE FROM public.system_notices;

-- Allow admins to create, update, and delete broadcasts
CREATE POLICY "Admins manage broadcasts"
  ON public.broadcasts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow admins to create, update, and delete system notices
CREATE POLICY "Admins manage system notices"
  ON public.system_notices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
