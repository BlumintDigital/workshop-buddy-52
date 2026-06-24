
CREATE TYPE public.broadcast_severity AS ENUM ('info', 'warning', 'critical');

CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text,
  severity public.broadcast_severity NOT NULL DEFAULT 'info',
  link_url text,
  link_label text,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active broadcasts"
ON public.broadcasts FOR SELECT
TO authenticated
USING (
  active = true
  AND starts_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
);

CREATE TRIGGER broadcasts_set_updated_at
BEFORE UPDATE ON public.broadcasts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
