CREATE TABLE public.system_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text,
  url text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

GRANT SELECT ON public.system_notices TO authenticated;
GRANT ALL ON public.system_notices TO service_role;

ALTER TABLE public.system_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own or global notices"
ON public.system_notices
FOR SELECT
TO authenticated
USING (user_id IS NULL OR user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notices;
ALTER TABLE public.system_notices REPLICA IDENTITY FULL;

CREATE INDEX idx_system_notices_created_at ON public.system_notices (created_at DESC);
CREATE INDEX idx_system_notices_user_id ON public.system_notices (user_id);