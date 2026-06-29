DROP POLICY IF EXISTS "Public can read avatars" ON storage.objects;
CREATE POLICY "Users read own avatar via storage api"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);