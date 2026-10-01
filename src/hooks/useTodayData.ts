import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { DASHBOARD_KEY, DASHBOARD_STALE_MS, useDashboardSnapshotFetcher } from "@/hooks/useDashboardQueries";
import { todayIso, type DashboardSnapshot } from "@/lib/dashboardQueries";

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
  ref: string;
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

type TodayData = {
  figures: TodayFigures;
  openJobs: OpenJob[];
  appointments: TodayAppointment[];
  revenueSeries: RevenuePoint[];
  teamLoad: TeamLoadEntry[];
};

/**
 * Loads the data behind the admin and manager "Today" cards. Cached per user for 30 seconds, so
 * coming back to Today shows the figures at once; overdue invoices are shared with the attention
 * queue and the nav badges.
 */
export function useTodayData({ appointmentsEnabled }: { appointmentsEnabled: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fetchSnapshot = useDashboardSnapshotFetcher();

  const query = useQuery({
    queryKey: [DASHBOARD_KEY, user?.id ?? "signed-out", "today", appointmentsEnabled],
    queryFn: async () => buildTodayData(await fetchSnapshot()),
    enabled: !!user,
    staleTime: DASHBOARD_STALE_MS,
  });

  useEffect(() => {
    if (query.isError) toast.error("Couldn't load today's figures. Try Refresh.");
  }, [query.isError]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [DASHBOARD_KEY] });
  }, [queryClient]);

  const data = query.data;
  return {
    figures: data?.figures ?? EMPTY,
    openJobs: data?.openJobs ?? [],
    appointments: data?.appointments ?? [],
    revenueSeries: data?.revenueSeries ?? [],
    teamLoad: data?.teamLoad ?? [],
    isLoading: query.isLoading,
    refresh,
  };
}

/** Turns the dashboard snapshot into the Today cards' figures, lists and chart series. */
function buildTodayData(snapshot: DashboardSnapshot): TodayData {
  const today = todayIso();
  const peopleRes = { data: snapshot.people };
  const revenueRes = { data: snapshot.paidInvoices };
  const jobsRes = { data: snapshot.openJobs };
  const apptsRes = { data: snapshot.appointments };
  const overdue = snapshot.overdueInvoices;

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
  const unpaid = snapshot.unpaidTotal;

  return {
    figures: {
      revenueMonth: current,
      revenueDelta: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
      openJobs: jobs.length,
      dueToday: jobs.filter((j) => j.due_date && j.due_date <= today).length,
      inReview: jobs.filter((j) => j.status === "review").length,
      awaitingPayment: unpaid,
      overdueAmount: overdue.reduce((sum, i) => sum + i.amount, 0),
      appointmentsToday: appts.length,
    },
    openJobs: jobs.slice(0, 6).map((j) => ({
      id: j.id,
      ref: j.ref,
      title: j.title,
      status: j.status,
      priority: j.priority,
      due_date: j.due_date,
      assignee: j.assigned_staff_id ? names.get(j.assigned_staff_id) || "Unnamed" : null,
    })),
    appointments: appts,
    revenueSeries: series,
    teamLoad: [...load.values()].sort((a, b) => b.hours - a.hours || b.jobs - a.jobs).slice(0, 6),
  };
}
