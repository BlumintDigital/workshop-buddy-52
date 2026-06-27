-- Track last_sign_in_at in profiles so the access review page doesn't
-- depend on auth.users.last_sign_in_at, which Supabase does not reliably set.
-- The app writes this on every successful signInWithPassword call.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ NULL;
