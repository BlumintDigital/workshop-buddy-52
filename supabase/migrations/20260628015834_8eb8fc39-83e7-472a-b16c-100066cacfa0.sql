
DROP POLICY IF EXISTS "Admins and managers can create signup codes" ON public.signup_codes;
DROP POLICY IF EXISTS "Admins and managers can update signup codes" ON public.signup_codes;

CREATE POLICY "Admins and managers can create signup codes"
ON public.signup_codes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND role IN ('staff'::app_role, 'client'::app_role)
  )
);

CREATE POLICY "Admins and managers can update signup codes"
ON public.signup_codes
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND role IN ('staff'::app_role, 'client'::app_role)
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'manager'::app_role)
    AND role IN ('staff'::app_role, 'client'::app_role)
  )
);
