-- Fix 1: Staff can insert job_attachments for any job, not just assigned ones
-- The INSERT policy was missing the EXISTS check that the SELECT policy already has.
DROP POLICY IF EXISTS "Staff insert job attachments" ON public.job_attachments;
CREATE POLICY "Staff insert job attachments" ON public.job_attachments FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'staff'::app_role)
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.jobs
      WHERE jobs.id = job_attachments.job_id
        AND jobs.assigned_staff_id = auth.uid()
    )
  );

-- Fix 2: Users can self-escalate is_super_admin or reactivate themselves via profile UPDATE.
-- Add WITH CHECK that freezes privileged columns during self-updates.
-- Admin and manager UPDATE policies have no WITH CHECK so they can still legitimately change these columns.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_super_admin = (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid())
    AND is_active      = (SELECT p.is_active      FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Fix 3: MFA enforcement is client-side only. Add RESTRICTIVE policies so that
-- admin and manager operations on the two most sensitive tables require aal2
-- (Supabase native TOTP must be enrolled and verified for the current session).
-- Non-admin/manager users pass automatically; only elevated roles are gated.
--
-- PREREQUISITE: All existing admin and manager accounts must have Supabase native
-- TOTP enrolled before this migration is applied, or they will be locked out of
-- write operations. Verify in Dashboard -> Authentication -> Users.

-- FOR ALL would block SELECT, breaking role-fetch at aal1 before the TOTP prompt is shown.
-- Restrict writes only; SELECT is left open so the login flow can read the role at aal1.
CREATE POLICY "Admin manager insert on user_roles requires MFA"
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'manager'::app_role))
    OR (auth.jwt() ->> 'aal') = 'aal2'
  );

CREATE POLICY "Admin manager update on user_roles requires MFA"
  ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'manager'::app_role))
    OR (auth.jwt() ->> 'aal') = 'aal2'
  )
  WITH CHECK (
    (NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'manager'::app_role))
    OR (auth.jwt() ->> 'aal') = 'aal2'
  );

CREATE POLICY "Admin manager delete on user_roles requires MFA"
  ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    (NOT has_role(auth.uid(), 'admin'::app_role) AND NOT has_role(auth.uid(), 'manager'::app_role))
    OR (auth.jwt() ->> 'aal') = 'aal2'
  );

CREATE POLICY "Admin and manager write operations on profiles require MFA"
  ON public.profiles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    (
      NOT has_role(auth.uid(), 'admin'::app_role)
      AND NOT has_role(auth.uid(), 'manager'::app_role)
    )
    OR (auth.jwt() ->> 'aal') = 'aal2'
  )
  WITH CHECK (
    (
      NOT has_role(auth.uid(), 'admin'::app_role)
      AND NOT has_role(auth.uid(), 'manager'::app_role)
    )
    OR (auth.jwt() ->> 'aal') = 'aal2'
  );
