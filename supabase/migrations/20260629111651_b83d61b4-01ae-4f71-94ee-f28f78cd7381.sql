DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.workshop_settings REPLICA IDENTITY FULL;