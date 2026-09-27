-- Projects, phase G: reports.
-- Profit and loss per project from what was charged and what it cost
-- (materials, labour, shipping, overhead), team performance for the goals
-- screen, and saved report layouts.

ALTER TABLE public.workshop_settings
  ADD COLUMN IF NOT EXISTS overhead_percent numeric NOT NULL DEFAULT 15 CHECK (overhead_percent >= 0 AND overhead_percent <= 100);

-- ─── 1. Saved reports ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS saved_reports_set_updated_at ON public.saved_reports;
CREATE TRIGGER saved_reports_set_updated_at BEFORE UPDATE ON public.saved_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Reporting reads saved reports" ON public.saved_reports;
CREATE POLICY "Reporting reads saved reports" ON public.saved_reports
  FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'reports'));
DROP POLICY IF EXISTS "Reporting saves reports" ON public.saved_reports;
CREATE POLICY "Reporting saves reports" ON public.saved_reports
  FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'reports') AND created_by = auth.uid());
DROP POLICY IF EXISTS "Owners change saved reports" ON public.saved_reports;
CREATE POLICY "Owners change saved reports" ON public.saved_reports
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_permission(auth.uid(), 'reports'));
DROP POLICY IF EXISTS "Owners delete saved reports" ON public.saved_reports;
CREATE POLICY "Owners delete saved reports" ON public.saved_reports
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- ─── 2. Profit and loss per project ─────────────────────────────────────────
-- charged           accepted quote plus accepted change requests (before tax)
-- invoiced / paid   invoices raised (not cancelled) and paid
-- materials_needed  parts requested (not cancelled), valued at current unit cost
-- materials_used    parts issued minus returned, at current unit cost
-- labour            hours logged × each person's hourly cost
-- overhead          overhead % of materials, labour and shipping
-- forecast          while work is open: the larger of parts needed and used, and
--                   of hours estimated and logged, at the average labour rate

CREATE OR REPLACE FUNCTION public.project_financials(_from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE (
  id uuid, ref text, title text, status text, intake_type text, client_name text,
  received_at timestamptz, finished_at timestamptz, due_date date,
  charged numeric, quoted_pending numeric, invoiced numeric, paid numeric,
  materials_needed_qty numeric, materials_needed_value numeric, materials_used_cost numeric,
  labour_hours numeric, estimated_hours numeric, labour_cost numeric, shipping_cost numeric,
  overhead numeric, total_cost numeric, profit numeric, margin_pct numeric,
  forecast_cost numeric, forecast_profit numeric, outcome text, assignees text[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH settings AS (
    SELECT COALESCE((SELECT overhead_percent FROM public.workshop_settings WHERE id = 1), 0) AS overhead_pct
  ),
  avg_rate AS (
    SELECT COALESCE(avg(hourly_cost), 0) AS rate FROM public.labour_rates
  ),
  scope AS (
    SELECT j.* FROM public.jobs j
    WHERE public.has_permission(auth.uid(), 'reports')
      AND j.status <> 'cancelled'
      AND (_from IS NULL OR COALESCE(j.received_at, j.created_at)::date >= _from)
      AND (_to IS NULL OR COALESCE(j.received_at, j.created_at)::date <= _to)
  ),
  quotes AS (
    SELECT q.job_id,
           sum(q.subtotal) FILTER (WHERE q.status = 'accepted') AS charged,
           sum(q.subtotal) FILTER (WHERE q.status IN ('sent', 'pending_approval')) AS pending
    FROM public.project_quotes q WHERE q.job_id IN (SELECT id FROM scope) GROUP BY q.job_id
  ),
  invoices AS (
    SELECT i.job_id,
           sum(COALESCE(i.base_total, i.total)) FILTER (WHERE i.status <> 'cancelled') AS invoiced,
           sum(COALESCE(i.base_total, i.total)) FILTER (WHERE i.status = 'paid') AS paid
    FROM public.invoices i WHERE i.job_id IN (SELECT id FROM scope) GROUP BY i.job_id
  ),
  needed AS (
    SELECT r.job_id, sum(l.quantity) AS qty, sum(l.quantity * COALESCE(it.unit_cost, 0)) AS value
    FROM public.stock_requests r
    JOIN public.stock_request_items l ON l.request_id = r.id AND l.status <> 'cancelled'
    LEFT JOIN public.inventory_items it ON it.id = l.item_id
    WHERE r.job_id IN (SELECT id FROM scope) AND r.status <> 'cancelled'
    GROUP BY r.job_id
  ),
  used AS (
    SELECT t.job_id,
           sum(CASE WHEN t.type = 'out' THEN t.quantity WHEN t.type = 'in' THEN -t.quantity ELSE 0 END * COALESCE(it.unit_cost, 0)) AS cost
    FROM public.inventory_transactions t
    JOIN public.inventory_items it ON it.id = t.item_id
    WHERE t.job_id IN (SELECT id FROM scope) AND t.type IN ('in', 'out')
    GROUP BY t.job_id
  ),
  labour AS (
    SELECT e.job_id, sum(e.hours) AS hours, sum(e.hours * COALESCE(r.hourly_cost, 0)) AS cost
    FROM public.time_entries e LEFT JOIN public.labour_rates r ON r.user_id = e.user_id
    WHERE e.job_id IN (SELECT id FROM scope)
    GROUP BY e.job_id
  ),
  task_hours AS (
    SELECT t.job_id, sum(t.estimated_hours) AS est FROM public.job_tasks t WHERE t.job_id IN (SELECT id FROM scope) GROUP BY t.job_id
  ),
  finished AS (
    SELECT e.job_id, min(e.created_at) AS at FROM public.project_events e
    WHERE e.kind = 'status' AND e.data->>'to' IN ('completed', 'shipped') AND e.job_id IN (SELECT id FROM scope)
    GROUP BY e.job_id
  ),
  people AS (
    SELECT x.job_id, array_agg(DISTINCT p.full_name ORDER BY p.full_name) FILTER (WHERE p.full_name IS NOT NULL) AS names
    FROM (
      SELECT job_id, assigned_to AS uid FROM public.job_tasks WHERE job_id IN (SELECT id FROM scope) AND assigned_to IS NOT NULL
      UNION SELECT id, assigned_staff_id FROM scope WHERE assigned_staff_id IS NOT NULL
      UNION SELECT job_id, user_id FROM public.time_entries WHERE job_id IN (SELECT id FROM scope)
    ) x JOIN public.profiles p ON p.id = x.uid
    GROUP BY x.job_id
  ),
  base AS (
    SELECT s.*,
      COALESCE(q.charged, 0) AS charged_v,
      COALESCE(q.pending, 0) AS pending_v,
      COALESCE(inv.invoiced, 0) AS invoiced_v,
      COALESCE(inv.paid, 0) AS paid_v,
      COALESCE(n.qty, 0) AS need_qty,
      round(COALESCE(n.value, 0), 2) AS need_value,
      round(COALESCE(u.cost, 0), 2) AS used_cost,
      COALESCE(l.hours, 0) AS hours_v,
      COALESCE(s.estimated_hours, th.est, 0) AS est_v,
      round(COALESCE(l.cost, 0), 2) AS labour_v,
      COALESCE(sh.shipping_cost, 0) AS ship_v,
      f.at AS finished_v,
      pe.names AS names_v,
      CASE WHEN COALESCE(l.hours, 0) > 0 AND COALESCE(l.cost, 0) > 0 THEN l.cost / l.hours ELSE (SELECT rate FROM avg_rate) END AS eff_rate
    FROM scope s
    LEFT JOIN quotes q ON q.job_id = s.id
    LEFT JOIN invoices inv ON inv.job_id = s.id
    LEFT JOIN needed n ON n.job_id = s.id
    LEFT JOIN used u ON u.job_id = s.id
    LEFT JOIN labour l ON l.job_id = s.id
    LEFT JOIN task_hours th ON th.job_id = s.id
    LEFT JOIN public.shipments sh ON sh.job_id = s.id
    LEFT JOIN finished f ON f.job_id = s.id
    LEFT JOIN people pe ON pe.job_id = s.id
  ),
  costed AS (
    SELECT b.*,
      round((b.used_cost + b.labour_v + b.ship_v) * (SELECT overhead_pct FROM settings) / 100, 2) AS overhead_v,
      round((GREATEST(b.used_cost, b.need_value) + GREATEST(b.hours_v, b.est_v) * b.eff_rate + b.ship_v)
            * (1 + (SELECT overhead_pct FROM settings) / 100), 2) AS forecast_v
    FROM base b
  )
  SELECT
    c.id, c.ref, c.title, c.status, c.intake_type,
    COALESCE(NULLIF(cp.company_name, ''), cp.full_name, c.contact_name) AS client_name,
    COALESCE(c.received_at, c.created_at), c.finished_v, c.due_date,
    c.charged_v, c.pending_v, c.invoiced_v, c.paid_v,
    c.need_qty, c.need_value, c.used_cost,
    c.hours_v, c.est_v, c.labour_v, c.ship_v,
    c.overhead_v,
    round(c.used_cost + c.labour_v + c.ship_v + c.overhead_v, 2),
    round(c.charged_v - (c.used_cost + c.labour_v + c.ship_v + c.overhead_v), 2),
    CASE WHEN c.charged_v > 0 THEN round((c.charged_v - (c.used_cost + c.labour_v + c.ship_v + c.overhead_v)) / c.charged_v * 100, 1) END,
    c.forecast_v,
    round(c.charged_v - c.forecast_v, 2),
    CASE
      WHEN c.charged_v = 0 THEN 'not_priced'
      WHEN c.status IN ('completed', 'shipped') THEN
        CASE WHEN c.charged_v - (c.used_cost + c.labour_v + c.ship_v + c.overhead_v) >= 0 THEN 'profit' ELSE 'loss' END
      ELSE CASE WHEN c.charged_v - c.forecast_v >= 0 THEN 'on_track' ELSE 'at_risk' END
    END,
    COALESCE(c.names_v, '{}')
  FROM costed c
  LEFT JOIN public.profiles cp ON cp.id = c.client_id
  ORDER BY COALESCE(c.received_at, c.created_at) DESC;
$$;

-- ─── 3. Team performance and the monthly goal ───────────────────────────────
-- Everyone on the team sees hours, handoffs and task value; labour cost only
-- appears for people with Reports and costs.

CREATE OR REPLACE FUNCTION public.team_performance(_from timestamptz, _to timestamptz)
RETURNS TABLE (user_id uuid, full_name text, role text, hours numeric, handoffs bigint, task_value numeric, projects bigint, labour_cost numeric)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH people AS (
    SELECT r.user_id, r.role::text AS role, p.full_name
    FROM public.user_roles r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.role IN ('staff', 'manager') AND p.is_active AND NOT COALESCE(p.is_super_admin, false)
  ),
  hrs AS (
    SELECT e.user_id, sum(e.hours) AS hours, count(DISTINCT e.job_id) AS projects
    FROM public.time_entries e WHERE e.work_date >= _from::date AND e.work_date <= _to::date GROUP BY e.user_id
  ),
  hand AS (
    SELECT h.from_user AS user_id, count(*) AS n FROM public.task_handoffs h WHERE h.created_at >= _from AND h.created_at <= _to GROUP BY h.from_user
  ),
  val AS (
    SELECT COALESCE(t.completed_by, t.assigned_to) AS user_id, sum(COALESCE(t.value, 0)) AS v
    FROM public.job_tasks t
    WHERE t.status = 'completed' AND COALESCE(t.completed_at, t.updated_at) >= _from AND COALESCE(t.completed_at, t.updated_at) <= _to
    GROUP BY 1
  )
  SELECT p.user_id, p.full_name, p.role,
         COALESCE(h.hours, 0), COALESCE(hd.n, 0), COALESCE(v.v, 0), COALESCE(h.projects, 0),
         CASE WHEN public.has_permission(auth.uid(), 'reports') THEN round(COALESCE(h.hours, 0) * COALESCE(lr.hourly_cost, 0), 2) END
  FROM people p
  LEFT JOIN hrs h ON h.user_id = p.user_id
  LEFT JOIN hand hd ON hd.user_id = p.user_id
  LEFT JOIN val v ON v.user_id = p.user_id
  LEFT JOIN public.labour_rates lr ON lr.user_id = p.user_id
  WHERE auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'client'::public.app_role)
  ORDER BY COALESCE(v.v, 0) DESC, COALESCE(h.hours, 0) DESC;
$$;

-- What the workshop delivered: the agreed value of projects that passed their
-- quality check in the period, and how many shipped.
CREATE OR REPLACE FUNCTION public.goal_summary(_from timestamptz, _to timestamptz)
RETURNS TABLE (delivered_value numeric, projects_finished bigint, projects_shipped bigint, hours_logged numeric, handoffs bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH finished AS (
    SELECT DISTINCT e.job_id FROM public.project_events e
    WHERE e.kind = 'status' AND e.data->>'to' = 'completed' AND e.created_at >= _from AND e.created_at <= _to
  )
  SELECT
    COALESCE((SELECT sum(q.subtotal) FROM public.project_quotes q WHERE q.status = 'accepted' AND q.job_id IN (SELECT job_id FROM finished)), 0),
    (SELECT count(*) FROM finished),
    (SELECT count(*) FROM public.shipments s WHERE s.shipped_at >= _from AND s.shipped_at <= _to),
    COALESCE((SELECT sum(hours) FROM public.time_entries WHERE work_date >= _from::date AND work_date <= _to::date), 0),
    (SELECT count(*) FROM public.task_handoffs WHERE created_at >= _from AND created_at <= _to)
  WHERE auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'client'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.project_financials(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_financials(date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.team_performance(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_performance(timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.goal_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goal_summary(timestamptz, timestamptz) TO authenticated;
