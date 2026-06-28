
-- 1. Drop VAPID private key column (moved to env secret)
ALTER TABLE public.workshop_admin_contacts DROP COLUMN IF EXISTS vapid_private_key;

-- 2. Manager read access to workshop_settings
CREATE POLICY "Managers can read workshop settings"
ON public.workshop_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'::public.app_role));

-- 3. AAL2 enforcement for admin/manager on sensitive tables
-- Restrictive policies: if user is admin or manager, JWT must be aal2.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['jobs','invoices','invoice_items','profiles','workshop_settings','workshop_admin_contacts','activity_logs'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "Require AAL2 for elevated roles" ON public.%I;
      CREATE POLICY "Require AAL2 for elevated roles"
        ON public.%I AS RESTRICTIVE
        FOR ALL TO authenticated
        USING (
          (NOT public.has_role(auth.uid(), 'admin'::public.app_role)
           AND NOT public.has_role(auth.uid(), 'manager'::public.app_role))
          OR ((auth.jwt() ->> 'aal') = 'aal2')
        )
        WITH CHECK (
          (NOT public.has_role(auth.uid(), 'admin'::public.app_role)
           AND NOT public.has_role(auth.uid(), 'manager'::public.app_role))
          OR ((auth.jwt() ->> 'aal') = 'aal2')
        );
    $f$, tbl, tbl);
  END LOOP;
END $$;

-- 4. Revoke EXECUTE from anon on SECURITY DEFINER trigger helper
REVOKE EXECUTE ON FUNCTION public.admin_onboarding_progress_set_updated_at() FROM anon, PUBLIC;

-- 5. Storage: drop public-listing-capable policy on workshop-assets.
-- Public URLs (object/public/...) keep working because the bucket is public.
DROP POLICY IF EXISTS "Public read scoped workshop-assets" ON storage.objects;
