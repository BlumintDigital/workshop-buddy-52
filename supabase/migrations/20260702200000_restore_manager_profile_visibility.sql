-- Restore manager visibility of profiles (applied manually on 2026-07-02).
--
-- Migration 20260624214548 dropped "Managers can view all profiles", which
-- made every user name render as "Unknown" for managers across the app
-- (staff page, job dialogs, dashboards). Managers legitimately need to read
-- profile names to run operations.

DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
CREATE POLICY "Managers can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));
