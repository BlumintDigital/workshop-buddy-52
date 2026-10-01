-- Trigger functions are not API endpoints.
--
-- Supabase's default privileges grant EXECUTE on every new public function to anon and
-- authenticated, so these SECURITY DEFINER trigger functions were reachable at /rest/v1/rpc
-- (security advisor lint 0028/0029). Postgres refuses to run a RETURNS trigger function outside a
-- trigger, so a direct call only ever errored, but there is no reason to expose them at all.
--
-- Triggers fire regardless of the caller's EXECUTE privilege on the trigger function, so revoking
-- it changes nothing for inserts and updates made through the app. None of these is called from
-- the app or an edge function via rpc. service_role keeps its grant.
--
-- A CREATE OR REPLACE keeps these revokes; a DROP and re-CREATE gets the default grants back and
-- needs the revoke repeated.

REVOKE EXECUTE ON FUNCTION public.accounting_invoice_changed()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accounting_invoice_items_changed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_staff_job_update()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.job_attachments_guard()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.job_tasks_start_project()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jobs_assign_ref()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jobs_open_shipment()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jobs_record_events()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_access_change()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_manager_role_escalation()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_quote_items_total()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.project_quotes_number()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_order_items_total()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_orders_number()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_handover_appointment()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.time_entries_sync_hours()          FROM PUBLIC, anon, authenticated;
