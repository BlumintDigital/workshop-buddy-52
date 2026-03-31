-- 1. Remove activity_logs from Realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_logs;
  END IF;
END $$;

-- 2. Restrict workshop_settings to authenticated users only
DROP POLICY IF EXISTS "Anyone can read workshop settings" ON public.workshop_settings;
CREATE POLICY "Authenticated users can read workshop settings" ON public.workshop_settings
  FOR SELECT TO authenticated
  USING (true);

-- 3. Add UPDATE policies for job-attachments storage bucket
CREATE POLICY "Admins can update job attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can update job attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'manager'))
  WITH CHECK (bucket_id = 'job-attachments' AND public.has_role(auth.uid(), 'manager'));

-- 4. Fix manager role escalation tautology
DROP POLICY IF EXISTS "Managers can update roles" ON public.user_roles;
CREATE POLICY "Managers can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager') AND role <> 'admin')
  WITH CHECK (public.has_role(auth.uid(), 'manager') AND role <> 'admin');