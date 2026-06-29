import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  Package,
  Receipt,
  Users,
  AlertTriangle,
  Plus,
  CalendarPlus,
  UserPlus,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

type RecentJob = { id: string; title: string; status: string; date: string };
type Appointment = { id: string; title: string | null; appointment_date: string; appointment_time: string };

const statusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  in_progress: "bg-tile-sky text-foreground/80",
  review: "bg-tile-blush text-foreground/80",
  completed: "bg-tile-sage text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
};

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 32;
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full" preserveAspectRatio="none">
      <polygon points={area} fill="hsl(var(--primary) / 0.18)" />
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
    revenueDelta: 0,
  });
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [jobsFilter, setJobsFilter] = useState<"all" | "active" | "completed">("active");
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
      setTodayAppts((todayApptsRes.data || []) as Appointment[]);
    };

    const fetchRecent = async () => {
      let q = supabase
        .from("jobs")
        .select("id, title, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (jobsFilter === "active") q = q.not("status", "in", "(completed,cancelled)");
      if (jobsFilter === "completed") q = q.eq("status", "completed");
      const { data } = await q;
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
  }, [appointmentsEnabled, jobsFilter]);

  const maxLoad = Math.max(1, ...staffLoad.map((s) => s.jobs));
  const deltaPositive = stats.revenueDelta >= 0;

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-5 sm:space-y-6 lg:space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground sm:text-sm sm:tracking-wider sm:normal-case sm:font-normal">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-1 text-display text-[2rem] leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              Hello, <span className="text-primary">{firstName}</span>
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">A calmer view of everything happening today.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="glow" size="sm"><Link to="/admin/jobs"><Plus className="h-4 w-4" />New job</Link></Button>
            {appointmentsEnabled && (
              <Button asChild variant="soft" size="sm"><Link to="/admin/appointments"><CalendarPlus className="h-4 w-4" />Appointment</Link></Button>
            )}
            <Button asChild variant="soft" size="sm"><Link to="/admin/invoices"><Receipt className="h-4 w-4" />Invoice</Link></Button>
            <Button asChild variant="soft" size="sm"><Link to="/admin/clients"><UserPlus className="h-4 w-4" />Client</Link></Button>
          </div>
        </div>

        <AdminOnboardingChecklist />

        {/* Bento grid */}
        {isLoading ? (
          <div className="grid gap-3 sm:gap-4 lg:gap-5 lg:grid-cols-12 lg:auto-rows-[minmax(0,auto)]">
            <Skeleton className="h-64 rounded-3xl lg:col-span-8 lg:row-span-2" />
            <Skeleton className="h-64 rounded-3xl lg:col-span-4 lg:row-span-2" />
            <Skeleton className="h-28 rounded-3xl sm:h-32 lg:col-span-3" />
            <Skeleton className="h-28 rounded-3xl sm:h-32 lg:col-span-3" />
            <Skeleton className="h-28 rounded-3xl sm:h-32 lg:col-span-2" />
            <Skeleton className="h-28 rounded-3xl sm:h-32 lg:col-span-4" />
            <Skeleton className="h-48 rounded-3xl lg:col-span-8" />
            <Skeleton className="h-48 rounded-3xl lg:col-span-4" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-5 lg:grid-cols-12 lg:auto-rows-[minmax(0,auto)]">

            {/* Revenue hero — 8 cols, spans 2 rows */}
            <Card tone="cream" className="col-span-2 overflow-hidden lg:col-span-8 lg:row-span-2">
              <CardContent className="flex h-full flex-col gap-6 p-5 sm:p-7 lg:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">
                      Revenue · last 6 months
                    </p>
                    <p className="mt-3 break-words text-display text-[2.5rem] leading-[0.95] tracking-tight tabular-nums sm:text-6xl lg:text-[4rem]">
                      {format(stats.revenueMonth)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      {stats.revenueDelta !== 0 && (
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                          deltaPositive ? "bg-tile-sage text-foreground/80" : "bg-tile-blush text-foreground/80",
                        )}>
                          {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(stats.revenueDelta)}%
                        </span>
                      )}
                      <span className="text-muted-foreground">vs. previous month</span>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-2xl bg-tile-sage p-3 ring-1 ring-foreground/5">
                    <Receipt className="h-5 w-5 text-foreground/70" />
                  </div>
                </div>
                <div className="mt-auto">
                  <Sparkline values={revenueSeries.map((s) => s.value)} />
                  <div className="mt-2 grid grid-cols-6 text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                    {revenueSeries.map((s) => (
                      <span key={s.label} className="text-center">{s.label}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>


            {/* Today's schedule — 4 cols, spans 2 rows */}
            <Card tone="mist" className="col-span-2 lg:col-span-4 lg:row-span-2">
              <CardContent className="flex h-full flex-col p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Today</p>
                    <h3 className="mt-1 text-display text-2xl tracking-tight">Schedule</h3>
                  </div>
                  <Link to="/admin/appointments" className="text-xs font-medium text-primary hover:underline">Open</Link>
                </div>
                <div className="mt-5 flex-1 space-y-2 overflow-auto">
                  {!appointmentsEnabled ? (
                    <p className="py-4 text-sm text-muted-foreground">Appointments are disabled.</p>
                  ) : todayAppts.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                      Nothing scheduled today.
                    </div>
                  ) : (
                    todayAppts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-2.5 ring-1 ring-foreground/5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.title || "Appointment"}</p>
                          <p className="text-xs text-muted-foreground">{(a.appointment_time || "").slice(0, 5)}</p>
                        </div>
                        <span className="rounded-full bg-tile-sage px-2 py-0.5 text-[11px] font-medium text-foreground/80">Today</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Metric tiles row */}
            <Card tone="sage" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Active jobs <Briefcase className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2.25rem] leading-none tabular-nums sm:text-4xl">{stats.activeJobs}</p>
                <Link to="/admin/jobs" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">View jobs →</Link>
              </CardContent>
            </Card>

            <Card tone="butter" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Pending review <Clock className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2.25rem] leading-none tabular-nums sm:text-4xl">{stats.pendingApprovals}</p>
                <Link to="/admin/jobs" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Approve →</Link>
              </CardContent>
            </Card>

            <Card tone="blush" className="lg:col-span-2">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Low stock <AlertTriangle className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2.25rem] leading-none tabular-nums sm:text-4xl">{stats.lowStock}</p>
                <Link to="/admin/inventory" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">Inventory →</Link>
              </CardContent>
            </Card>

            <Card tone="sky" className="col-span-2 lg:col-span-4">
              <CardContent className="p-5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <Link to="/admin/jobs" className="flex flex-col items-center gap-1 rounded-xl bg-card/70 p-3 text-center ring-1 ring-foreground/5 transition hover:bg-card hover:ring-foreground/10">
                    <Briefcase className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Jobs</span>
                    <span className="text-base font-semibold tabular-nums">{stats.jobs}</span>
                  </Link>
                  <Link to="/admin/invoices" className="flex flex-col items-center gap-1 rounded-xl bg-card/70 p-3 text-center ring-1 ring-foreground/5 transition hover:bg-card hover:ring-foreground/10">
                    <Receipt className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Invoices</span>
                    <span className="text-base font-semibold tabular-nums">{stats.invoices}</span>
                  </Link>
                  <Link to="/admin/users" className="flex flex-col items-center gap-1 rounded-xl bg-card/70 p-3 text-center ring-1 ring-foreground/5 transition hover:bg-card hover:ring-foreground/10">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Users</span>
                    <span className="text-base font-semibold tabular-nums">{stats.users}</span>
                  </Link>
                </div>
              </CardContent>
            </Card>


            {/* Staff load — 8 cols */}
            <Card tone="default" className="col-span-2 lg:col-span-8">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Team</p>
                    <h3 className="mt-1 text-display text-2xl tracking-tight">Staff load</h3>
                  </div>
                  <Link to="/admin/users" className="text-xs font-medium text-primary hover:underline">View team</Link>
                </div>
                <div className="mt-5 space-y-3.5">
                  {staffLoad.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No active assignments.</p>
                  ) : (
                    staffLoad.map((s) => (
                      <div key={s.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{s.name}</span>
                          <span className="tabular-nums text-muted-foreground">{s.jobs} jobs</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                          <div
                            className="h-full rounded-full bg-gradient-sage transition-[width] duration-500"
                            style={{ width: `${(s.jobs / maxLoad) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent jobs — 4 cols */}
            <Card tone="default" className="col-span-2 lg:col-span-4">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Recent</p>
                    <h3 className="mt-1 text-display text-2xl tracking-tight">Jobs</h3>
                  </div>
                  <Link to="/admin/jobs" className="text-xs font-medium text-primary hover:underline">All</Link>
                </div>
                <div className="mt-3 inline-flex rounded-full border border-border/70 bg-card/60 p-1 text-[11px]">
                  {(["active", "completed", "all"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setJobsFilter(f)}
                      className={cn(
                        "rounded-full px-2.5 py-1 capitalize transition-colors min-h-[28px]",
                        jobsFilter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5">
                  {recentJobs.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No jobs yet.</p>
                  ) : (
                    recentJobs.map((j) => (
                      <Link
                        key={j.id}
                        to={`/admin/jobs/${j.id}`}
                        className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition hover:bg-secondary"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.date}</p>
                        </div>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", statusTone[j.status] || "bg-muted")}>
                          {j.status.replace("_", " ")}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Bottom: extra context */}
            <Card tone="cream" className="lg:col-span-4">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Inventory <Package className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2.25rem] leading-none tabular-nums sm:text-4xl">{stats.inventory}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">Items tracked</p>
              </CardContent>
            </Card>
            <Card tone="mist" className="lg:col-span-4">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Overdue invoices <Receipt className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2.25rem] leading-none tabular-nums sm:text-4xl">{stats.overdueInvoices}</p>
                <Link to="/admin/invoices" className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline">Review →</Link>
              </CardContent>
            </Card>
            <Card tone="sage" className="col-span-2 lg:col-span-4">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Appointments <Calendar className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2.25rem] leading-none tabular-nums sm:text-4xl">{stats.appointments}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">Total scheduled</p>
              </CardContent>
            </Card>

          </div>
        )}

        <ActivityFeed />
      </div>
    </DashboardLayout>
  );
}
