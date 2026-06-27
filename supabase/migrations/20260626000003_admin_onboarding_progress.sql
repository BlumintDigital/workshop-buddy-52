CREATE TABLE IF NOT EXISTS public.admin_onboarding_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  skipped_steps text[] NOT NULL DEFAULT ARRAY[]::text[],
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_onboarding_progress ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.admin_onboarding_progress TO authenticated;
GRANT ALL ON public.admin_onboarding_progress TO service_role;

CREATE OR REPLACE FUNCTION public.admin_onboarding_progress_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_onboarding_progress_updated_at ON public.admin_onboarding_progress;
CREATE TRIGGER admin_onboarding_progress_updated_at
BEFORE UPDATE ON public.admin_onboarding_progress
FOR EACH ROW EXECUTE FUNCTION public.admin_onboarding_progress_set_updated_at();

DROP POLICY IF EXISTS "Admins can read own onboarding progress" ON public.admin_onboarding_progress;
CREATE POLICY "Admins can read own onboarding progress"
ON public.admin_onboarding_progress
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can create own onboarding progress" ON public.admin_onboarding_progress;
CREATE POLICY "Admins can create own onboarding progress"
ON public.admin_onboarding_progress
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can update own onboarding progress" ON public.admin_onboarding_progress;
CREATE POLICY "Admins can update own onboarding progress"
ON public.admin_onboarding_progress
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
