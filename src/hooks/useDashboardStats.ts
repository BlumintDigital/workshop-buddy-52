import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AdminDashboardStats = {
  jobs: number;
  appointments: number;
  inventory: number;
  invoices: number;
  users: number;
  lowStock: number;
  activeJobs: number;
  pendingApprovals: number;
  overdueInvoices: number;
  revenueMonth: number;
  revenueDelta: number;
};

export type RecentJob = { id: string; title: string; status: string; date: string };
export type TodayAppointment = { id: string; title: string | null; appointment_date: string; appointment_time: string };
export type RevenuePoint = { label: string; value: number };
export type StaffLoadEntry = { name: string; jobs: number };

const EMPTY_STATS: AdminDashboardStats = {
  jobs: 0,
  appointments: 0,
  inventory: 0,
  invoices: 0,
  users: 0,
  lowStock: 0,
  activeJobs: 0,
  pendingApprovals: 0,
  overdueInvoices: 0,
  revenueMonth: 0,
  revenueDelta: 0,
};

/**
 * Loads all data for the admin dashboard: headline stats, the 6-month revenue
 * series, today's appointments, staff workload, and recent jobs.
 * Call `refresh()` to reload on demand.
 */
export function useDashboardStats(appointmentsEnabled: boolean) {
  const [stats, setStats] = useState<AdminDashboardStats>(EMPTY_STATS);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [todayAppts, setTodayAppts] = useState<TodayAppointment[]>([]);
  const [staffLoad, setStaffLoad] = useState<StaffLoadEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setIsLoading(true);

    const since6mo = new Date();
    since6mo.setMonth(since6mo.getMonth() - 5);
    since6mo.setDate(1);
    since6mo.setHours(0, 0, 0, 0);

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const run = async () => {
      const [
        jobs,
        appts,
        items,
        invs,
        roles,
        lowStock,
        revInvoices,
        todayApptsRes,
        activeJobsRes,
        approvalsRes,
        overdueRes,
        staffRolesRes,
        staffJobsRes,
      ] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        appointmentsEnabled
          ? supabase.from("appointments").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0 } as any),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("quantity, min_stock"),
        supabase
          .from("invoices")
          .select("base_total, total, status, paid_at, created_at")
          .gte("created_at", since6mo.toISOString()),
        appointmentsEnabled
          ? supabase
              .from("appointments")
              .select("id, title, appointment_date, appointment_time")
              .eq("appointment_date", startToday.toISOString().slice(0, 10))
              .order("appointment_time", { ascending: true })
              .limit(6)
          : Promise.resolve({ data: [] } as any),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "review"),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("profiles").select("id, full_name").limit(50),
        supabase.from("jobs").select("assigned_staff_id").not("status", "in", "(completed,cancelled)"),
      ]);

      // Bucket paid/created invoice totals into the last 6 calendar months
      const buckets: Record<string, number> = {};
      const order: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = d.toLocaleDateString(undefined, { month: "short" });
        buckets[key] = 0;
        order.push(`${key}|${label}`);
      }
      (revInvoices.data || []).forEach((row: any) => {
        const d = new Date(row.paid_at || row.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (key in buckets) {
          // Prefer base_total (workshop currency), fall back to total for legacy rows
          buckets[key] += Number(row.base_total ?? row.total) || 0;
        }
      });
      const series = order.map((k) => {
        const [key, label] = k.split("|");
        return { label, value: Math.round(buckets[key]) };
      });
      const current = series[series.length - 1]?.value || 0;
      const previous = series[series.length - 2]?.value || 0;
      const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;

      const loadMap: Record<string, number> = {};
      (staffJobsRes.data || []).forEach((j: any) => {
        if (j.assigned_staff_id) loadMap[j.assigned_staff_id] = (loadMap[j.assigned_staff_id] || 0) + 1;
      });
      const nameMap = new Map<string, string>(
        (staffRolesRes.data || []).map((p: any) => [p.id, p.full_name || "Unnamed"]),
      );
      const load = Object.entries(loadMap)
        .map(([id, n]) => ({ name: nameMap.get(id) || "Unassigned", jobs: n }))
        .sort((a, b) => b.jobs - a.jobs)
        .slice(0, 5);
      setStaffLoad(load);

      setStats({
        jobs: jobs.count || 0,
        appointments: appts.count || 0,
        inventory: items.count || 0,
        invoices: invs.count || 0,
        users: roles.count || 0,
        lowStock: (lowStock.data || []).filter((i: any) => i.quantity <= i.min_stock).length,
        activeJobs: activeJobsRes.count || 0,
        pendingApprovals: approvalsRes.count || 0,
        overdueInvoices: overdueRes.count || 0,
        revenueMonth: current,
        revenueDelta: deltaPct,
      });
      setRevenueSeries(series);
      setTodayAppts((todayApptsRes.data || []) as TodayAppointment[]);
    };

    const fetchRecent = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentJobs(
        (data || []).map((j: any) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          date: new Date(j.created_at).toLocaleDateString(),
        })),
      );
    };

    Promise.all([run(), fetchRecent()]).catch(() => {
      toast.error("Failed to load dashboard data. Please refresh.");
    }).finally(() => setIsLoading(false));
  }, [appointmentsEnabled, refreshKey]);

  return { stats, recentJobs, revenueSeries, todayAppts, staffLoad, isLoading, refresh };
}
