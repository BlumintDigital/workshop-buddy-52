-- Today dashboard, second version: honest counts and a To do summary.
--
-- * "Open projects" now counts every open stage (received, evaluation and quote too), with an
--   Intake figure for the first three.
-- * Every To do line is an exact count from the server; nothing is cut off at 200.
-- * Team load reads task assignees (job_tasks.assigned_to) and hours logged this week, not the old
--   single jobs.assigned_staff_id.
-- * Labour efficiency and quote conversion are worked out here.
-- * dashboard_todo_projects(kind) is the one definition behind each project count and the filtered
--   project list it opens, so the number on Today always matches the list.
--
-- Both functions stay SECURITY INVOKER, as before: every inner query runs as the caller, so row-level
-- security and the 2FA restrictive policies apply exactly as they do to ordinary REST reads.
-- project_financials keeps its own Reports permission check, so at-risk counts are 0 without it.

create or replace function public.dashboard_todo_projects(p_kind text)
returns setof public.jobs
language sql
stable
security invoker
set search_path = public
as $$
  select j.*
  from public.jobs j
  where case p_kind
    when 'open' then j.status in ('received', 'evaluation', 'quote', 'pending', 'in_progress', 'review')
    when 'intake' then j.status in ('received', 'evaluation', 'quote')
    -- Finished with no live invoice.
    when 'uninvoiced' then j.status in ('completed', 'shipped')
      and not exists (select 1 from public.invoices i where i.job_id = j.id and i.status <> 'cancelled')
    -- Open and no stage change for more than 7 days.
    when 'stuck' then j.status in ('received', 'evaluation', 'quote', 'pending', 'in_progress', 'review')
      and coalesce(
        (select max(e.created_at) from public.project_events e where e.job_id = j.id and e.kind = 'status'),
        j.received_at,
        j.created_at
      ) < now() - interval '7 days'
    -- Open work forecast to cost more than it brings in, or finished at a loss in the last 30 days.
    when 'at_risk' then j.id in (
      select f.id from public.project_financials() f
      where f.outcome = 'at_risk' or (f.outcome = 'loss' and f.finished_at >= now() - interval '30 days')
    )
    else false
  end;
$$;

revoke all on function public.dashboard_todo_projects(text) from public, anon;
grant execute on function public.dashboard_todo_projects(text) to authenticated;

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
  with week as (
    -- Monday of this week, and how many working days (Mon to Fri) have started so far.
    select (p_today - (extract(isodow from p_today)::int - 1))::date as start_day,
           least(5, extract(isodow from p_today)::int) as workdays
  ),
  open_jobs as (
    select * from public.dashboard_todo_projects('open')
  ),
  technicians as (
    select r.user_id
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.role = 'staff' and p.is_active and not coalesce(p.is_super_admin, false)
  ),
  week_hours as (
    select e.user_id, sum(e.hours) as hours
    from public.time_entries e, week w
    where e.work_date between w.start_day and p_today
    group by e.user_id
  ),
  open_tasks as (
    select t.assigned_to as user_id, count(*) as tasks, sum(coalesce(t.estimated_hours, 0)) as hours
    from public.job_tasks t
    join open_jobs j on j.id = t.job_id
    where t.status <> 'completed' and t.assigned_to is not null
    group by t.assigned_to
  ),
  efficiency as (
    select
      coalesce((select sum(h.hours) from week_hours h where h.user_id in (select user_id from technicians)), 0) as logged,
      (select count(*) from technicians) * (select workdays from week) * 7.5 as available,
      (select count(*) from technicians) as people
  ),
  quotes as (
    select
      count(*) filter (where q.status = 'accepted') as accepted,
      count(*) filter (where q.status = 'declined') as declined
    from public.project_quotes q
    where q.kind = 'quote'
      and q.status in ('accepted', 'declined')
      and coalesce(q.decided_at, q.approved_at, q.updated_at) >= (p_today - 90)
  )
  select jsonb_build_object(
    -- The six open projects due soonest, for the list on Today.
    'open_jobs', coalesce((
      select jsonb_agg(x order by x.due_date asc nulls last)
      from (
        select j.id, j.ref, j.title, j.status, j.priority, j.due_date, lead.full_name as assignee
        from open_jobs j
        left join public.profiles lead on lead.id = j.assigned_staff_id
        order by j.due_date asc nulls last
        limit 6
      ) x
    ), '[]'::jsonb),

    'open_count', (select count(*) from open_jobs),
    'intake_count', (select count(*) from open_jobs where status in ('received', 'evaluation', 'quote')),
    'due_count', (select count(*) from open_jobs where due_date <= p_today),
    'review_count', (select count(*) from open_jobs where status = 'review'),

    -- Per person: open tasks assigned to them, estimated hours left on those, and hours logged this week.
    'team_load', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.full_name, 'Unnamed'),
        'tasks', coalesce(t.tasks, 0),
        'remaining_hours', coalesce(t.hours, 0),
        'logged_hours', coalesce(h.hours, 0)
      ) order by coalesce(h.hours, 0) + coalesce(t.hours, 0) desc, coalesce(t.tasks, 0) desc)
      from open_tasks t
      full join week_hours h on h.user_id = t.user_id
      join public.profiles p on p.id = coalesce(t.user_id, h.user_id)
    ), '[]'::jsonb),

    'efficiency', (
      select jsonb_build_object(
        'logged_hours', e.logged,
        'available_hours', e.available,
        'people', e.people,
        'pct', case when e.available > 0 then round(e.logged / e.available * 100) end
      ) from efficiency e
    ),

    'quote_conversion', (
      select jsonb_build_object(
        'accepted', q.accepted,
        'declined', q.declined,
        'pct', case when q.accepted + q.declined > 0 then round(q.accepted::numeric / (q.accepted + q.declined) * 100) end
      ) from quotes q
    ),

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

    'uninvoiced_count', (select count(*) from public.dashboard_todo_projects('uninvoiced')),
    -- The three that have waited longest, for the line's preview.
    'uninvoiced_preview', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'ref', u.ref, 'title', u.title, 'client_id', u.client_id))
      from (select * from public.dashboard_todo_projects('uninvoiced') order by updated_at asc limit 3) u
    ), '[]'::jsonb),

    'po_approval_count', (select count(*) from public.purchase_orders where status = 'pending_approval'),
    'ship_waiting_count', (select count(*) from public.shipments where status in ('ready', 'awaiting_client')),
    'stuck_count', (select count(*) from public.dashboard_todo_projects('stuck')),
    'at_risk_count', (select count(*) from public.dashboard_todo_projects('at_risk'))
  );
$$;

revoke all on function public.dashboard_today(date, timestamptz, timestamptz, boolean, boolean) from public, anon;
grant execute on function public.dashboard_today(date, timestamptz, timestamptz, boolean, boolean) to authenticated;
