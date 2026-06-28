GRANT SELECT, INSERT ON public.dismissed_notices TO authenticated;
GRANT ALL ON public.dismissed_notices TO service_role;
GRANT SELECT, INSERT ON public.dismissed_broadcasts TO authenticated;
GRANT ALL ON public.dismissed_broadcasts TO service_role;