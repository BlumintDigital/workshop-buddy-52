-- VAPID public key stored here so the frontend can read it without a secret
ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS vapid_public_key TEXT;

-- Push subscriptions: one row per browser session per user
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth_key    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Each user can only manage their own subscriptions
CREATE POLICY "users_own_subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
