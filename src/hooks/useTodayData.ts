import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchOverdueInvoices, OPEN_JOB_STATUSES, todayIso } from "@/lib/dashboardQueries";

export type TodayFigures = {
  revenueMonth: number;
  /** Percentage change vs the previous calendar month; null when there is nothing to compare. */
  revenueDelta: number | null;
  openJobs: number;
  dueToday: number;
  inReview: number;
  awaitingPayment: number;
  overdueAmount: number;
  appointmentsToday: number;
};

export type OpenJob = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee: string | null;
};
export type TodayAppointment = { id: string; title: string | null; appointment_time: string; duration_minutes: number | null };
export type RevenuePoint = { label: string; value: number };
export type TeamLoadEntry = { id: string; name: string; jobs: number; hours: number };

const EMPTY: TodayFigures = {
  revenueMonth: 0,
  revenueDelta: null,
  openJobs: 0,
  dueToday: 0,
  inReview: 0,
  awaitingPayment: 0,
  overdueAmount: 0,
  appointmentsToday: 0,
};

/**
 * Loads the data behind the admin and manager "Today" cards.
 * Counts that also appear in the attention queue come from lib/dashboardQueries.
 */
export function useTodayData({ appointmentsEnabled }: { appointmentsEnabled: boolean }) {
  const [figures, setFigures] = useState<TodayFigures>(EMPTY);
  const [openJobs, setOpenJobs] = useState<OpenJob[]>([]);
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [teamLoad, setTeamLoad] = useState<TeamLoadEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const today = todayIso();

    const since6mo = new Date();
    since6mo.setMonth(since6mo.getMonth() - 5);
    since6mo.setDate(1);
    since6mo.setHours(0, 0, 0, 0);

    const run = async () => {
      const [jobsRes, revenueRes, unpaidRes, overdue, apptsRes, peopleRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, title, status, priority, due_date, estimated_hours, assigned_staff_id")
          .in("status", [...OPEN_JOB_STATUSES])
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("invoices")
          .select("base_total, total, status, paid_at, created_at")
          .eq("status", "paid")
          .gte("paid_at", since6mo.toISOString()),
        supabase.from("invoices").select("base_total, total").in("status", ["sent", "overdue"]),
        fetchOverdueInvoices(),
        appointmentsEnabled
          ? supabase
              .from("appointments")
              .select("id, title, appointment_time, duration_minutes, status")
              .eq("appointment_date", today)
              .not("status", "in", "(completed,cancelled)")
              .order("appointment_time", { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("profiles").select("id, full_name"),
      ]);

      const names = new Map<string, string>(
        ((peopleRes.data || []) as any[]).map((p) => [p.id, p.full_name || "Unnamed"]),
      );

      // Revenue = paid invoices bucketed by the month they were paid.
      const buckets: Record<string, number> = {};
      const order: { key: string; label: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        buckets[key] = 0;
        order.push({ key, label: d.toLocaleDateString(undefined, { month: "short" }) });
      }
      ((revenueRes.data || []) as any[]).forEach((row) => {
        const d = new Date(row.paid_at || row.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (key in buckets) buckets[key] += Number(row.base_total ?? row.total) || 0;
      });
      const series = order.map(({ key, label }) => ({ label, value: Math.round(buckets[key]) }));
      const current = series[series.length - 1]?.value ?? 0;
      const previous = series[series.length - 2]?.value ?? 0;

      const jobs = (jobsRes.data || []) as any[];
      const load = new Map<string, TeamLoadEntry>();
      jobs.forEach((j) => {
        if (!j.assigned_staff_id) return;
        const entry = load.get(j.assigned_staff_id) ?? {
          id: j.assigned_staff_id,
          name: names.get(j.assigned_staff_id) || "Unnamed",
          jobs: 0,
          hours: 0,
        };
        entry.jobs += 1;
        entry.hours += Number(j.estimated_hours) || 0;
        load.set(j.assigned_staff_id, entry);
      });

      const appts = (apptsRes.data || []) as TodayAppointment[];
      const unpaid = ((unpaidRes.data || []) as any[]).reduce(
        (sum, row) => sum + (Number(row.base_total ?? row.total) || 0),
        0,
      );

      if (cancelled) return;
      setFigures({
        revenueMonth: current,
        revenueDelta: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
        openJobs: jobs.length,
        dueToday: jobs.filter((j) => j.due_date && j.due_date <= today).length,
        inReview: jobs.filter((j) => j.status === "review").length,
        awaitingPayment: unpaid,
        overdueAmount: overdue.reduce((sum, i) => sum + i.amount, 0),
        appointmentsToday: appts.length,
      });
      setOpenJobs(
        jobs.slice(0, 6).map((j) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          priority: j.priority,
          due_date: j.due_date,
          assignee: j.assigned_staff_id ? names.get(j.assigned_staff_id) || "Unnamed" : null,
        })),
      );
      setAppointments(appts);
      setRevenueSeries(series);
      setTeamLoad([...load.values()].sort((a, b) => b.hours - a.hours || b.jobs - a.jobs).slice(0, 6));
    };

    run()
      .catch(() => {
        if (!cancelled) toast.error("Couldn't load today's figures. Try Refresh.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appointmentsEnabled, refreshKey]);

  return { figures, openJobs, appointments, revenueSeries, teamLoad, isLoading, refresh };
}
