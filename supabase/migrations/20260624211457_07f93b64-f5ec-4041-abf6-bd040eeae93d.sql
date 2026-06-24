
CREATE TABLE public.signup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_codes_code_not_empty CHECK (length(trim(code)) >= 4),
  CONSTRAINT signup_codes_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_codes TO authenticated;
GRANT ALL ON public.signup_codes TO service_role;

ALTER TABLE public.signup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view signup codes"
ON public.signup_codes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can create signup codes"
ON public.signup_codes FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can update signup codes"
ON public.signup_codes FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can delete signup codes"
ON public.signup_codes FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.signup_codes_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER signup_codes_updated_at
BEFORE UPDATE ON public.signup_codes
FOR EACH ROW EXECUTE FUNCTION public.signup_codes_set_updated_at();

-- Atomic validate + consume, callable by anon (pre-signup) and authenticated.
CREATE OR REPLACE FUNCTION public.redeem_signup_code(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.signup_codes%ROWTYPE;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO _row
  FROM public.signup_codes
  WHERE lower(code) = lower(trim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT _row.active THEN RETURN false; END IF;
  IF _row.expires_at IS NOT NULL AND _row.expires_at < now() THEN RETURN false; END IF;
  IF _row.max_uses IS NOT NULL AND _row.uses_count >= _row.max_uses THEN RETURN false; END IF;

  UPDATE public.signup_codes
  SET uses_count = uses_count + 1
  WHERE id = _row.id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_signup_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_signup_code(text) TO anon, authenticated;
