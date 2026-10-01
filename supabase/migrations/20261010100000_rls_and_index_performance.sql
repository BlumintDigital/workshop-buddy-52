-- Performance pass on row-level security and indexes (Supabase performance advisors).
-- Access rules do not change: every policy keeps the same meaning.
--
-- 1. Merge the overlapping "Admins can manage ..." / "Managers can manage ..." pairs into one policy per table,
--    so Postgres evaluates one permissive policy instead of two for the same action.
-- 2. Wrap auth.uid() in a scalar subquery inside every public policy. Postgres then evaluates it once per
--    statement (an InitPlan) instead of once per row.
-- 3. Index every foreign key that has no covering index.
-- 4. Drop three duplicate indexes (identical definitions; the copies dropped here were never used).

-- 1. Merge admin + manager policies ------------------------------------------------------------------
-- These were TO public; anon can never hold the admin or manager role, so TO authenticated is equivalent.

drop policy if exists "Admins can manage all appointments" on public.appointments;
drop policy if exists "Managers can manage all appointments" on public.appointments;
drop policy if exists "Admins and managers can manage all appointments" on public.appointments;
create policy "Admins and managers can manage all appointments" on public.appointments
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role));

drop policy if exists "Admins can manage all invoice items" on public.invoice_items;
drop policy if exists "Managers can manage all invoice items" on public.invoice_items;
drop policy if exists "Admins and managers can manage all invoice items" on public.invoice_items;
create policy "Admins and managers can manage all invoice items" on public.invoice_items
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role));

drop policy if exists "Admins can manage all invoices" on public.invoices;
drop policy if exists "Managers can manage all invoices" on public.invoices;
drop policy if exists "Admins and managers can manage all invoices" on public.invoices;
create policy "Admins and managers can manage all invoices" on public.invoices
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role));

drop policy if exists "Admins can manage all jobs" on public.jobs;
drop policy if exists "Managers can manage all jobs" on public.jobs;
drop policy if exists "Admins and managers can manage all jobs" on public.jobs;
create policy "Admins and managers can manage all jobs" on public.jobs
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role));

drop policy if exists "Admins can manage inventory" on public.inventory_items;
drop policy if exists "Managers can manage inventory" on public.inventory_items;
drop policy if exists "Admins and managers can manage inventory" on public.inventory_items;
create policy "Admins and managers can manage inventory" on public.inventory_items
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role));

drop policy if exists "Admins can manage inventory transactions" on public.inventory_transactions;
drop policy if exists "Managers can manage inventory transactions" on public.inventory_transactions;
drop policy if exists "Admins and managers can manage inventory transactions" on public.inventory_transactions;
create policy "Admins and managers can manage inventory transactions" on public.inventory_transactions
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role) or public.has_role((select auth.uid()), 'manager'::public.app_role));

-- 2. Evaluate auth.uid() once per statement in every remaining policy ----------------------------------
-- pg_policies shows an already-wrapped call as "( SELECT auth.uid() AS uid)", so the lookbehind skips
-- those and the block is safe to run more than once.

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)' or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)')
  loop
    new_qual := regexp_replace(p.qual, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    new_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    execute stmt;
  end loop;
end
$$;

-- 3. Index foreign keys without a covering index -------------------------------------------------------

create index if not exists accounting_connections_connected_by_idx on public.accounting_connections (connected_by);
create index if not exists client_requests_converted_job_id_idx on public.client_requests (converted_job_id);
create index if not exists client_requests_quoted_invoice_id_idx on public.client_requests (quoted_invoice_id);
create index if not exists client_requests_reviewed_by_idx on public.client_requests (reviewed_by);
create index if not exists dismissed_broadcasts_broadcast_id_idx on public.dismissed_broadcasts (broadcast_id);
create index if not exists dismissed_notices_notice_id_idx on public.dismissed_notices (notice_id);
create index if not exists feature_flags_updated_by_idx on public.feature_flags (updated_by);
create index if not exists inventory_items_supplier_id_idx on public.inventory_items (supplier_id);
create index if not exists inventory_transactions_job_id_idx on public.inventory_transactions (job_id);
create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index if not exists invoice_pdf_versions_generated_by_idx on public.invoice_pdf_versions (generated_by);
create index if not exists invoices_job_id_idx on public.invoices (job_id);
create index if not exists job_attachments_task_id_idx on public.job_attachments (task_id);
create index if not exists job_comments_job_id_idx on public.job_comments (job_id);
create index if not exists job_comments_user_id_idx on public.job_comments (user_id);
create index if not exists job_task_notes_task_id_idx on public.job_task_notes (task_id);
create index if not exists job_tasks_completed_by_idx on public.job_tasks (completed_by);
create index if not exists job_tasks_rework_of_idx on public.job_tasks (rework_of);
create index if not exists jobs_received_by_idx on public.jobs (received_by);
create index if not exists labour_rates_updated_by_idx on public.labour_rates (updated_by);
create index if not exists mfa_trusted_sessions_device_id_idx on public.mfa_trusted_sessions (device_id);
create index if not exists monthly_revenue_goals_set_by_idx on public.monthly_revenue_goals (set_by);
create index if not exists project_quotes_approved_by_idx on public.project_quotes (approved_by);
create index if not exists project_quotes_created_by_idx on public.project_quotes (created_by);
create index if not exists project_quotes_decided_by_idx on public.project_quotes (decided_by);
create index if not exists purchase_order_items_item_id_idx on public.purchase_order_items (item_id);
create index if not exists purchase_order_items_request_item_id_idx on public.purchase_order_items (request_item_id);
create index if not exists purchase_orders_approved_by_idx on public.purchase_orders (approved_by);
create index if not exists purchase_orders_created_by_idx on public.purchase_orders (created_by);
create index if not exists purchase_orders_job_id_idx on public.purchase_orders (job_id);
create index if not exists purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index if not exists request_quote_items_request_id_idx on public.request_quote_items (request_id);
create index if not exists saved_reports_created_by_idx on public.saved_reports (created_by);
create index if not exists shipments_shipped_by_idx on public.shipments (shipped_by);
create index if not exists stock_request_items_item_id_idx on public.stock_request_items (item_id);
create index if not exists stock_requests_requested_by_idx on public.stock_requests (requested_by);
create index if not exists stock_requests_task_id_idx on public.stock_requests (task_id);
create index if not exists task_handoffs_from_user_idx on public.task_handoffs (from_user);
create index if not exists task_handoffs_next_task_id_idx on public.task_handoffs (next_task_id);
create index if not exists time_entries_task_id_idx on public.time_entries (task_id);
create index if not exists user_permissions_granted_by_idx on public.user_permissions (granted_by);

-- 4. Drop duplicate indexes (an identical index remains on each table) ---------------------------------

drop index if exists public.idx_activity_logs_created_at;   -- same as idx_activity_logs_created
drop index if exists public.idx_job_tasks_assigned_to;      -- same as job_tasks_assigned_idx
drop index if exists public.idx_system_notices_created_at;  -- same as idx_system_notices_created
