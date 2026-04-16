-- Add manager read policy to bug_reports (table already created in 20260408000001)
-- Using DO block to avoid error if policy already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bug_reports'
      AND policyname = 'Managers view bug reports'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Managers view bug reports"
        ON public.bug_reports FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'manager'))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bug_reports'
      AND policyname = 'Admins manage bug reports'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins manage bug reports"
        ON public.bug_reports FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
        WITH CHECK (public.has_role(auth.uid(), 'admin'))
    $policy$;
  END IF;
END $$;
