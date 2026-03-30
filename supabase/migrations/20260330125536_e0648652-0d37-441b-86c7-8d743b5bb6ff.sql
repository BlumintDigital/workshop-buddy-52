
-- 1. Fix privilege escalation: Drop overly broad policies on user_roles and recreate with proper scoping

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view roles" ON public.user_roles;

-- Recreate admin policy scoped to authenticated only
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Managers can view all roles
CREATE POLICY "Managers can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

-- Managers can update roles but NOT escalate to admin
CREATE POLICY "Managers can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- Managers can insert roles but NOT admin role
CREATE POLICY "Managers can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- Managers can delete roles but NOT admin role
CREATE POLICY "Managers can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND role != 'admin'::app_role);

-- 2. Fix notifications: Allow managers and staff to insert notifications
CREATE POLICY "Managers can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Staff can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'staff'::app_role));

-- Allow users to delete own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 3. Fix profiles: Scope admin/manager SELECT policies to authenticated
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));
