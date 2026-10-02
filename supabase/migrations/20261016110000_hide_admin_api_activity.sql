-- Changes Shoplane Control makes through admin-api (feature switches, assistant settings,
-- broadcasts, provisioning) are logged with details.source = 'admin-api'. They're Shoplane's
-- own operations, not the workshop's, so the workshop's Activity Logs, Today feed and exports
-- don't show them. Control still reads them through admin-api, which uses the service role.
DROP POLICY IF EXISTS "Hide Shoplane operations from the workshop" ON public.activity_logs;
CREATE POLICY "Hide Shoplane operations from the workshop" ON public.activity_logs
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (COALESCE(details->>'source', '') <> 'admin-api');
