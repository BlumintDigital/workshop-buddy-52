-- MFA trusted devices and backup codes
CREATE TABLE public.mfa_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  device_label text,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_hash)
);
CREATE INDEX mfa_trusted_devices_user_idx ON public.mfa_trusted_devices(user_id);

GRANT SELECT, DELETE ON public.mfa_trusted_devices TO authenticated;
GRANT ALL ON public.mfa_trusted_devices TO service_role;
ALTER TABLE public.mfa_trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trusted devices"
  ON public.mfa_trusted_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trusted devices"
  ON public.mfa_trusted_devices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
CREATE INDEX mfa_backup_codes_user_idx ON public.mfa_backup_codes(user_id);

GRANT SELECT ON public.mfa_backup_codes TO authenticated;
GRANT ALL ON public.mfa_backup_codes TO service_role;
ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backup codes"
  ON public.mfa_backup_codes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);