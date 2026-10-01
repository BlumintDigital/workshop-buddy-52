-- Everything the admin and manager Today dashboard shows, in one round trip.
--
-- Replaces about a dozen separate requests (Today cards, attention queue, review and stock counts).
-- SECURITY INVOKER on purpose: every inner query runs as the caller, so row-level security and the
-- 2FA restrictive policies apply exactly as they do to the individual REST requests it replaces.
-- The browser passes its local calendar date and cut-offs so "today" matches what the user sees.

create or replace function public.dashboard_today(
  p_today date,
  p_paid_since timestamptz,
  p_stale_quote_before timestamptz,
  p_include_appointments boolean default true,
  p_include_invites boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with open_jobs as (
    select id, ref, title, status, priority, due_date, estimated_hours, assigned_staff_id
    from public.jobs
    where status in ('pending', 'in_progress', 'review')
  )
  select jsonb_build_object(
    'open_jobs', coalesce((
      select jsonb_agg(to_jsonb(j) order by j.due_date asc nulls last) from open_jobs j
    ), '[]'::jsonb),

    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name))
      from public.profiles p
      where p.id in (select assigned_staff_id from open_jobs where assigned_staff_id is not null)
    ), '[]'::jsonb),

    'paid_invoices', coalesce((
      select jsonb_agg(jsonb_build_object('base_total', i.base_total, 'total', i.total, 'paid_at', i.paid_at, 'created_at', i.created_at))
      from public.invoices i
      where i.status = 'paid' and i.paid_at >= p_paid_since
    ), '[]'::jsonb),

    'unpaid_total', (
      select coalesce(sum(coalesce(i.base_total, i.total)), 0)
      from public.invoices i
      where i.status in ('sent', 'overdue')
    ),

    'overdue_invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice_number', i.invoice_number, 'client_id', i.client_id,
        'due_date', i.due_date, 'total', i.total, 'base_total', i.base_total
      ) order by i.due_date asc)
      from public.invoices i
      where i.status = 'overdue' or (i.status = 'sent' and i.due_date < p_today)
    ), '[]'::jsonb),

    'draft_invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice_number', i.invoice_number, 'job_id', i.job_id, 'total', i.total, 'base_total', i.base_total
      ) order by i.created_at asc)
      from public.invoices i
      where i.status = 'draft'
    ), '[]'::jsonb),

    'appointments', case when p_include_appointments then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', a.title, 'appointment_time', a.appointment_time,
        'duration_minutes', a.duration_minutes, 'status', a.status
      ) order by a.appointment_time asc)
      from public.appointments a
      where a.appointment_date = p_today and a.status not in ('completed', 'cancelled')
    ), '[]'::jsonb) else '[]'::jsonb end,

    'review_count', (select count(*) from public.jobs where status = 'review'),

    'low_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'quantity', s.quantity, 'min_stock', s.min_stock, 'unit', s.unit
      ) order by s.quantity - s.min_stock asc)
      from public.inventory_items s
      where s.quantity <= s.min_stock
    ), '[]'::jsonb),

    'stale_quotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'number', q.number, 'subtotal', q.subtotal, 'sent_at', q.sent_at,
        'job_ref', j.ref, 'job_title', j.title
      ) order by q.sent_at asc)
      from public.project_quotes q
      left join public.jobs j on j.id = q.job_id
      where q.status = 'sent' and q.sent_at < p_stale_quote_before
    ), '[]'::jsonb),

    'pending_invites', case when p_include_invites then (
      select count(*) from public.profiles
      where invited_at is not null and invite_accepted_at is null
    ) else 0 end,

    -- Finished projects with no live invoice: the oldest 200 completed or shipped, as before.
    'uninvoiced_projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'ref', f.ref, 'title', f.title, 'client_id', f.client_id) order by f.updated_at asc)
      from (
        select id, ref, title, client_id, updated_at
        from public.jobs
        where status in ('completed', 'shipped')
        order by updated_at asc
        limit 200
      ) f
      where not exists (
        select 1 from public.invoices inv where inv.job_id = f.id and inv.status <> 'cancelled'
      )
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_today(date, timestamptz, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.dashboard_today(date, timestamptz, timestamptz, boolean, boolean) to authenticated;
