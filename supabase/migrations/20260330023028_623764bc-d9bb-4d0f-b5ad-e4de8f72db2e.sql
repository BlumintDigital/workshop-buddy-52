
-- Fix overly permissive insert policy - restrict to service_role only
DROP POLICY "System can insert notifications" ON public.notifications;

CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
