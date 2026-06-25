
-- Remove duplicate VAPID private key material from workshop_settings.
-- Private key + subject now live exclusively in workshop_admin_contacts (admin-only table).
ALTER TABLE public.workshop_settings DROP COLUMN IF EXISTS vapid_private_key;
ALTER TABLE public.workshop_settings DROP COLUMN IF EXISTS vapid_subject;

-- Harden user_roles UPDATE policy: prevent a manager from updating their own row.
DROP POLICY IF EXISTS "Managers can update non-privileged roles" ON public.user_roles;
CREATE POLICY "Managers can update non-privileged roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND role = ANY (ARRAY['staff'::app_role, 'client'::app_role])
  AND user_id <> auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'manager'::app_role)
  AND role = ANY (ARRAY['staff'::app_role, 'client'::app_role])
  AND user_id <> auth.uid()
);
