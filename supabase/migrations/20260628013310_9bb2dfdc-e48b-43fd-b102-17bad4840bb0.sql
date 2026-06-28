ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz;