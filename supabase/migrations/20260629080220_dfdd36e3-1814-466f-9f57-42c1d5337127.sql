ALTER TABLE public.workshop_settings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_settings;