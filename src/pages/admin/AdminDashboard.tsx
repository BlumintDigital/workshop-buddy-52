import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  Package,
  FileText,
  Users,
  AlertTriangle,
  Plus,
  CalendarPlus,
  UserPlus,
  Receipt,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { LiveTickerStrip } from "@/components/dashboard/LiveTickerStrip";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RevenueHero } from "@/components/dashboard/RevenueHero";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { JobStatusChart } from "@/components/dashboard/JobStatusChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { useCurrency } from "@/hooks/useCurrency";

type RecentJob = { id: string; title: string; status: string; date: string };
type Appointment = { id: string; title: string | null; scheduled_at: string };

export default function AdminDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { profile, user } = useAuth();
  const { format } = useCurrency();

  const [stats, setStats] = useState({
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
    revenueDelta: "",
  });
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [revenueSeries, setRevenueSeries] = useState<{ label: string; value: number }[]>([]);
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [staffLoad, setStaffLoad] = useState<{ name: string; jobs: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const firstName = useMemo(() => {
    const full = (profile?.full_name || user?.email || "there").trim();
    return full.split(/\s+|@/)[0];
  }, [profile, user]);

  useEffect(() => {
    setIsLoading(true);

    const since6mo = new Date();
    since6mo.setMonth(since6mo.getMonth() - 5);
    since6mo.setDate(1);
    since6mo.setHours(0, 0, 0, 0);

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);

    const run = async () => {
      const [
        jobs,
        appts,
        items,
        invs,
        roles,
        lowStock,
        statusRows,
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
        supabase.from("jobs").select("status, assigned_to"),
        supabase
          .from("invoices")
          .select("total, created_at, status")
          .gte("created_at", since6mo.toISOString()),
        appointmentsEnabled
          ? supabase
              .from("appointments")
              .select("id, title, scheduled_at")
              .gte("scheduled_at", startToday.toISOString())
              .lte("scheduled_at", endToday.toISOString())
              .order("scheduled_at", { ascending: true })
              .limit(6)
          : Promise.resolve({ data: [] } as any),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "review"),
        supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .in("status", ["overdue", "unpaid"]),
        supabase.from("profiles").select("id, full_name").limit(50),
        supabase.from("jobs").select("assigned_to").not("status", "in", "(completed,cancelled)"),
      ]);

      // Revenue series — last 6 months
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
        const d = new Date(row.created_at);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (key in buckets) buckets[key] += Number(row.total) || 0;
      });
      const series = order.map((k) => {
        const [key, label] = k.split("|");
        return { label, value: Math.round(buckets[key]) };
      });
      const current = series[series.length - 1]?.value || 0;
      const previous = series[series.length - 2]?.value || 0;
      const deltaPct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;

      // Status pie + counts
      const counts: Record<string, number> = {};
      (statusRows.data || []).forEach((j: any) => {
        counts[j.status] = (counts[j.status] || 0) + 1;
      });
      const orderS = ["pending", "in_progress", "review", "completed", "cancelled"];
      setStatusData(
        orderS
          .map((s) => ({ name: s.replace("_", " "), value: counts[s] || 0 }))
          .filter((d) => d.value > 0),
      );

      // Staff load — top 5 by active jobs
      const loadMap: Record<string, number> = {};
      (staffJobsRes.data || []).forEach((j: any) => {
        if (j.assigned_to) loadMap[j.assigned_to] = (loadMap[j.assigned_to] || 0) + 1;
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
        revenueDelta: deltaPct === 0 ? "" : `${deltaPct > 0 ? "" : "-"}${Math.abs(deltaPct)}%`,
      });
      setRevenueSeries(series);
      setTodayAppts((todayApptsRes.data || []) as Appointment[]);
    };

    const fetchRecent = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, title, status, created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      setRecentJobs(
        (data || []).map((j: any) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          date: new Date(j.created_at).toLocaleDateString(),
        })),
      );
    };

    Promise.all([run(), fetchRecent()]).finally(() => setIsLoading(false));
  }, [appointmentsEnabled]);

  const maxLoad = Math.max(1, ...staffLoad.map((s) => s.jobs));

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6">
        {/* Hero header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1 className="text-display text-4xl leading-tight sm:text-5xl">
              Hello, <span className="text-primary">{firstName}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Your command center — every signal in one place.</p>
          </div>
          <QuickActions
            actions={[
              { label: "New job", to: "/admin/jobs", icon: Plus, primary: true },
              ...(appointmentsEnabled ? [{ label: "New appointment", to: "/admin/appointments", icon: CalendarPlus }] : []),
              { label: "New invoice", to: "/admin/invoices", icon: Receipt },
              { label: "New client", to: "/admin/clients", icon: UserPlus },
            ]}
          />
        </div>

        <AdminOnboardingChecklist />

        {/* Live ticker */}
        <LiveTickerStrip
          items={[
            { label: "Active jobs", value: stats.activeJobs, icon: Briefcase, to: "/admin/jobs", tone: "default" },
            { label: "Pending approvals", value: stats.pendingApprovals, icon: Clock, to: "/admin/jobs", tone: stats.pendingApprovals > 0 ? "warn" : "default" },
            { label: "Overdue invoices", value: stats.overdueInvoices, icon: Receipt, to: "/admin/invoices", tone: stats.overdueInvoices > 0 ? "danger" : "good" },
            { label: "Low stock", value: stats.lowStock, icon: AlertTriangle, to: "/admin/inventory", tone: stats.lowStock > 0 ? "warn" : "good" },
          ]}
        />

        {/* Revenue hero */}
        {isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : (
          <RevenueHero
            greeting={`Last 6 months · ${new Date().getFullYear()}`}
            totalRevenue={stats.revenueMonth}
            delta={stats.revenueDelta}
            series={revenueSeries}
          />
        )}

        {/* Metric tiles */}
        {isLoading ? (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Total jobs" value={stats.jobs} icon={Briefcase} hint="All workshop jobs" accent="violet" />
            {appointmentsEnabled && (
              <MetricCard title="Appointments" value={stats.appointments} icon={Calendar} hint="Scheduled bookings" accent="lime" />
            )}
            <MetricCard title="Inventory" value={stats.inventory} icon={Package} hint="Items tracked" accent="violet" />
            <MetricCard title="Invoices" value={stats.invoices} icon={FileText} hint={`${format(stats.revenueMonth)} this month`} accent="lime" />
            <MetricCard title="Users" value={stats.users} icon={Users} hint="Registered accounts" accent="neutral" />
          </div>
        )}

        {/* Operational grid */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7 space-y-4">
            <JobStatusChart data={statusData} />
            <SectionCard
              title="Staff load"
              description="Active jobs assigned per team member"
              action={
                <Link to="/admin/users" className="text-xs text-primary hover:underline">View team</Link>
              }
            >
              {staffLoad.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No active assignments.</p>
              ) : (
                <div className="space-y-3">
                  {staffLoad.map((s) => (
                    <div key={s.name} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{s.name}</span>
                        <span className="tabular-nums text-muted-foreground">{s.jobs} jobs</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-gradient-violet"
                          style={{ width: `${(s.jobs / maxLoad) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="min-w-0 lg:col-span-5 space-y-4">
            {appointmentsEnabled && (
              <SectionCard
                title="Today's schedule"
                description={`${todayAppts.length} appointment${todayAppts.length === 1 ? "" : "s"}`}
                action={
                  <Link to="/admin/appointments" className="text-xs text-primary hover:underline">Open calendar</Link>
                }
              >
                {todayAppts.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 text-accent" />
                    Nothing scheduled today.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {todayAppts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.title || "Appointment"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Today</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            <RecentActivity activities={recentJobs} title="Recent jobs" />
          </div>
        </div>

        <ActivityFeed />
      </div>
    </DashboardLayout>
  );
}
