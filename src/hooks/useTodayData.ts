import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { DASHBOARD_KEY, DASHBOARD_STALE_MS, useDashboardSnapshotFetcher } from "@/hooks/useDashboardQueries";
import type { DashboardSnapshot, Efficiency, QuoteConversion, TeamLoadEntry } from "@/lib/dashboardQueries";

export type { TeamLoadEntry } from "@/lib/dashboardQueries";

export type TodayFigures = {
  revenueMonth: number;
  /** Percentage change vs the previous calendar month; null when there is nothing to compare. */
  revenueDelta: number | null;
  openProjects: number;
  intake: number;
  dueToday: number;
  inReview: number;
  awaitingPayment: number;
  overdueAmount: number;
  appointmentsToday: number;
  efficiency: Efficiency;
  quoteConversion: QuoteConversion;
};

export type OpenJob = DashboardSnapshot["openJobs"][number];
export type TodayAppointment = { id: string; title: string | null; appointment_time: string; duration_minutes: number | null };
export type RevenuePoint = { label: string; value: number };

export type TodayData = {
  figures: TodayFigures;
  openJobs: OpenJob[];
  appointments: TodayAppointment[];
  revenueSeries: RevenuePoint[];
  teamLoad: TeamLoadEntry[];
};

/**
 * Loads the data behind the admin and manager "Today" cards. Cached per user for 30 seconds, so
 * coming back to Today shows the figures at once. `data` stays undefined while loading or after a
 * failed load, so a card can never show 0 or £0.00 that it doesn't know.
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

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [DASHBOARD_KEY] });
  }, [queryClient]);

  return {
    data: query.data,
    isLoading: !query.data && !query.isError,
    isError: query.isError && !query.data,
    isFetching: query.isFetching,
    refresh,
  };
}

/** Turns the dashboard snapshot into the Today cards' figures, lists and chart series. */
export function buildTodayData(snapshot: DashboardSnapshot, now = new Date()): TodayData {
  // Revenue = paid invoices bucketed by the month they were paid.
  const buckets: Record<string, number> = {};
  const order: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets[key] = 0;
    order.push({ key, label: d.toLocaleDateString(undefined, { month: "short" }) });
  }
  snapshot.paidInvoices.forEach((row) => {
    const d = new Date(row.paid_at || row.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key in buckets) buckets[key] += Number(row.base_total ?? row.total) || 0;
  });
  const series = order.map(({ key, label }) => ({ label, value: Math.round(buckets[key]) }));
  const current = series[series.length - 1]?.value ?? 0;
  const previous = series[series.length - 2]?.value ?? 0;

  return {
    figures: {
      revenueMonth: current,
      revenueDelta: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
      openProjects: snapshot.openCount,
      intake: snapshot.intakeCount,
      dueToday: snapshot.dueCount,
      inReview: snapshot.reviewCount,
      awaitingPayment: snapshot.unpaidTotal,
      overdueAmount: snapshot.overdueInvoices.reduce((sum, i) => sum + i.amount, 0),
      appointmentsToday: snapshot.appointments.length,
      efficiency: snapshot.efficiency,
      quoteConversion: snapshot.quoteConversion,
    },
    openJobs: snapshot.openJobs,
    appointments: snapshot.appointments,
    revenueSeries: series,
    teamLoad: snapshot.teamLoad.slice(0, 8),
  };
}
