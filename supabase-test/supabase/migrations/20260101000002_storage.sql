-- Test database only: storage buckets and their access rules, copied from
-- production. The public-schema dump does not include the storage schema.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('job-attachments', 'job-attachments', false, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('workshop-assets', 'workshop-assets', true, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('invoice-pdfs', 'invoice-pdfs', false, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('inventory-docs', 'inventory-docs', false, NULL, NULL) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins and managers manage invoice pdf files" ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'invoice-pdfs'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))
  WITH CHECK (((bucket_id = 'invoice-pdfs'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));

CREATE POLICY "Admins can update job attachments" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'job-attachments'::text) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (((bucket_id = 'job-attachments'::text) AND has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins delete workshop-assets" ON storage.objects AS PERMISSIVE FOR DELETE TO public
  USING (((bucket_id = 'workshop-assets'::text) AND has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Admins upload workshop-assets" ON storage.objects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((bucket_id = 'workshop-assets'::text) AND has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY "Authorized users can upload job attachments" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'job-attachments'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR (EXISTS ( SELECT 1
   FROM jobs
  WHERE (((jobs.id)::text = (storage.foldername(objects.name))[1]) AND (jobs.assigned_staff_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM jobs
  WHERE (((jobs.id)::text = (storage.foldername(objects.name))[1]) AND (jobs.client_id = auth.uid())))))));

CREATE POLICY "Clients read own invoice pdf files" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'invoice-pdfs'::text) AND (EXISTS ( SELECT 1
   FROM invoices i
  WHERE (((i.id)::text = (storage.foldername(objects.name))[1]) AND (i.client_id = auth.uid()))))));

CREATE POLICY "Feature gate client portal files" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (((bucket_id <> 'job-attachments'::text) OR (NOT has_role(auth.uid(), 'client'::app_role)) OR is_feature_enabled('client_portal'::text)))
  WITH CHECK (((bucket_id <> 'job-attachments'::text) OR (NOT has_role(auth.uid(), 'client'::app_role)) OR is_feature_enabled('client_portal'::text)));

CREATE POLICY "Managers can update job attachments" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'job-attachments'::text) AND has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK (((bucket_id = 'job-attachments'::text) AND has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Stores and approvers read inventory documents" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'inventory-docs'::text) AND (is_storekeeper(auth.uid()) OR has_permission(auth.uid(), 'inventory_approve'::text))));

CREATE POLICY "Stores removes inventory documents" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'inventory-docs'::text) AND is_storekeeper(auth.uid())));

CREATE POLICY "Stores uploads inventory documents" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'inventory-docs'::text) AND is_storekeeper(auth.uid())));

CREATE POLICY "Team members upload project files" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'job-attachments'::text) AND has_role(auth.uid(), 'staff'::app_role) AND can_view_job_path(auth.uid(), (storage.foldername(name))[1])));

CREATE POLICY "Users can delete own avatar" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can delete own uploads" ON storage.objects AS PERMISSIVE FOR DELETE TO public
  USING (((bucket_id = 'job-attachments'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR (EXISTS ( SELECT 1
   FROM jobs
  WHERE (((jobs.id)::text = (storage.foldername(objects.name))[1]) AND ((jobs.assigned_staff_id = auth.uid()) OR (jobs.client_id = auth.uid()))))))));

CREATE POLICY "Users can read own job attachments" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (((bucket_id = 'job-attachments'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR (has_role(auth.uid(), 'staff'::app_role) AND can_view_job_path(auth.uid(), (storage.foldername(name))[1])) OR (EXISTS ( SELECT 1
   FROM (job_attachments a
     JOIN jobs j ON ((j.id = a.job_id)))
  WHERE ((a.file_path = objects.name) AND (j.client_id = auth.uid()) AND (a.task_id IS NULL) AND (a.kind = ANY (ARRAY['intake'::text, 'shared'::text, 'delivery'::text, 'client'::text]))))))));

CREATE POLICY "Users can update own avatar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users can upload own avatar" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Users read own avatar via storage api" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
