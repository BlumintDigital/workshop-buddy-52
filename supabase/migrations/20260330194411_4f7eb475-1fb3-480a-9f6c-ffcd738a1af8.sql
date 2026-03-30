
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.workshop_settings ADD COLUMN IF NOT EXISTS login_image_url text;

-- Create public workshop-assets storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('workshop-assets', 'workshop-assets', true) ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read from workshop-assets (public bucket for login image)
CREATE POLICY "Public read workshop-assets" ON storage.objects FOR SELECT USING (bucket_id = 'workshop-assets');

-- Allow admins to upload to workshop-assets
CREATE POLICY "Admins upload workshop-assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'workshop-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow admins to delete from workshop-assets
CREATE POLICY "Admins delete workshop-assets" ON storage.objects FOR DELETE USING (bucket_id = 'workshop-assets' AND public.has_role(auth.uid(), 'admin'::public.app_role));
