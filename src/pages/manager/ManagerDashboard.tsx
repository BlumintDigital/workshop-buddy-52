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
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { jobStatusTone as statusTone } from "@/lib/statusStyles";

type RecentJob = { id: string; title: string; status: string; date: string };
type Appointment = { id: string; title: string | null; appointment_date: string; appointment_time: string };


export default function ManagerDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { profile, user } = useAuth();
  const { format } = useCurrency();

  const [stats, setStats] = useState({
    jobs: 0,
    appointments: 0,
    inventory: 0,
    invoices: 0,
    staff: 0,
    lowStock: 0,
    activeJobs: 0,
    pendingApprovals: 0,
    overdueInvoices: 0,
    overdueAmount: 0,
  });
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [jobsFilter, setJobsFilter] = useState<"all" | "active" | "completed">("active");
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [staffLoad, setStaffLoad] = useState<{ name: string; jobs: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const firstName = useMemo(() => {
    const full = (profile?.full_name || user?.email || "there").trim();
    return full.split(/\s+|@/)[0];
  }, [profile, user]);

  useEffect(() => {
    setIsLoading(true);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const run = async () => {
      const [
        jobs,
        appts,
        items,
        invs,
        staff,
        lowStock,
        todayApptsRes,
        activeJobsRes,
        approvalsRes,
        overdueRes,
        overdueAmountRes,
        staffRolesRes,
        staffJobsRes,
      ] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        appointmentsEnabled
          ? supabase
              .from("appointments")
              .select("*", { count: "exact", head: true })
              // Scheduled means not completed/cancelled
              .not("status", "in", "(completed,cancelled)")
          : Promise.resolve({ count: 0 } as any),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "staff"),
        supabase.from("inventory_items").select("quantity, min_stock"),
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
        supabase.from("invoices").select("base_total, total").eq("status", "overdue"),
        supabase.from("profiles").select("id, full_name").limit(100),
        supabase.from("jobs").select("assigned_staff_id").not("status", "in", "(completed,cancelled)"),
      ]);

      const loadMap: Record<string, number> = {};
      (staffJobsRes.data || []).forEach((j: any) => {
        if (j.assigned_staff_id) loadMap[j.assigned_staff_id] = (loadMap[j.assigned_staff_id] || 0) + 1;
      });
      const nameMap = new Map<string, string>(
        (staffRolesRes.data || []).map((p: any) => [p.id, p.full_name || "Unnamed"]),
      );
      setStaffLoad(
        Object.entries(loadMap)
          .map(([id, n]) => ({ name: nameMap.get(id) || "Unassigned", jobs: n }))
          .sort((a, b) => b.jobs - a.jobs)
          .slice(0, 5),
      );

      const overdueAmount = (overdueAmountRes.data || []).reduce(
        (sum: number, r: any) => sum + (Number(r.base_total ?? r.total) || 0),
        0,
      );

      setStats({
        jobs: jobs.count || 0,
        appointments: appts.count || 0,
        inventory: items.count || 0,
        invoices: invs.count || 0,
        staff: staff.count || 0,
        lowStock: (lowStock.data || []).filter((i: any) => i.quantity <= i.min_stock).length,
        activeJobs: activeJobsRes.count || 0,
        pendingApprovals: approvalsRes.count || 0,
        overdueInvoices: overdueRes.count || 0,
        overdueAmount,
      });
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

    Promise.all([run(), fetchRecent()]).catch(() => {
      toast.error("Failed to load dashboard data. Please refresh.");
    }).finally(() => setIsLoading(false));
  }, [appointmentsEnabled, jobsFilter]);

  const maxLoad = Math.max(1, ...staffLoad.map((s) => s.jobs));

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-1 flex items-center gap-3 text-display text-[2rem] leading-[1.05] tracking-tight sm:text-5xl">
              <Avatar className="h-10 w-10 sm:h-14 sm:w-14 ring-2 ring-primary/20 shrink-0">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={firstName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-base sm:text-xl font-semibold">
                  {firstName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>Hi, <span className="text-primary">{firstName}</span></span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Operations at a glance — what needs you next.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="glow" size="sm"><Link to="/manager/jobs"><Plus className="h-4 w-4" />New job</Link></Button>
            {appointmentsEnabled && (
              <Button asChild variant="soft" size="sm"><Link to="/manager/appointments"><CalendarPlus className="h-4 w-4" />Appointment</Link></Button>
            )}
            <Button asChild variant="soft" size="sm"><Link to="/manager/clients"><UserPlus className="h-4 w-4" />Client</Link></Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-32 rounded-2xl col-span-2", i < 2 ? "lg:col-span-6" : "lg:col-span-3")} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(0,auto)]">
            {/* Staff load — hero */}
            <Card tone="cream" className="col-span-2 lg:col-span-8 lg:row-span-2">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Team</p>
                    <h3 className="mt-1 text-display text-2xl sm:text-3xl">Staff workload</h3>
                  </div>
                  <Link to="/manager/staff" className="text-xs font-medium text-primary hover:underline">Manage</Link>
                </div>
                <div className="mt-5 sm:mt-6 space-y-4">
                  {staffLoad.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">No active assignments.</p>
                  ) : (
                    staffLoad.map((s) => (
                      <div key={s.name}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{s.name}</span>
                          <span className="tabular-nums text-muted-foreground">{s.jobs} active</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-card/70">
                          <div
                            className="h-full rounded-full bg-gradient-sage"
                            style={{ width: `${(s.jobs / maxLoad) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Today's schedule */}
            <Card tone="mist" className="col-span-2 lg:col-span-4 lg:row-span-2">
              <CardContent className="flex h-full flex-col p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Today</p>
                    <h3 className="mt-1 text-display text-2xl">Schedule</h3>
                  </div>
                  <Link to="/manager/appointments" className="text-xs font-medium text-primary hover:underline">Open</Link>
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
                      <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-3 min-h-[52px]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.title || "Appointment"}</p>
                          <p className="text-xs text-muted-foreground">{(a.appointment_time || "").slice(0, 5)}</p>
                        </div>
                        <span className="rounded-full bg-tile-sage px-2 py-0.5 text-[11px] text-foreground/80">Today</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card tone="sage" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Active jobs <Briefcase className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.activeJobs}</p>
                <Link to="/manager/jobs" className="mt-2 inline-block text-xs text-primary hover:underline">View →</Link>
              </CardContent>
            </Card>
            <Card tone="butter" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Pending review <Clock className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.pendingApprovals}</p>
                <Link to="/manager/jobs" className="mt-2 inline-block text-xs text-primary hover:underline">Approve →</Link>
              </CardContent>
            </Card>
            <Card tone="blush" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Low stock <AlertTriangle className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.lowStock}</p>
                <Link to="/manager/inventory" className="mt-2 inline-block text-xs text-primary hover:underline">Inventory →</Link>
              </CardContent>
            </Card>
            <Card tone="sky" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Overdue <Receipt className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.overdueInvoices}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{format(stats.overdueAmount)}</p>
              </CardContent>
            </Card>

            {/* Recent jobs */}
            <Card tone="default" className="col-span-2 lg:col-span-8">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Recent</p>
                    <h3 className="mt-1 text-display text-2xl">Jobs</h3>
                  </div>
                  <Link to="/manager/jobs" className="text-xs font-medium text-primary hover:underline">All</Link>
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
                    <p className="py-3 text-sm text-muted-foreground">No jobs match this filter.</p>
                  ) : (
                    recentJobs.map((j) => (
                      <Link
                        key={j.id}
                        to={`/manager/jobs/${j.id}`}
                        className="flex items-center justify-between gap-2 rounded-xl px-3 py-3 min-h-[48px] hover:bg-secondary"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.date}</p>
                        </div>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", statusTone[j.status] || "bg-muted")}>
                          {j.status.replace("_", " ")}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card tone="cream" className="col-span-2 lg:col-span-4">
              <CardContent className="p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                    Staff <Users className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-display text-3xl tabular-nums">{stats.staff}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                    Inventory items <Package className="h-4 w-4" />
                  </div>
                  <p className="mt-2 text-display text-3xl tabular-nums">{stats.inventory}</p>
                </div>
                {appointmentsEnabled && (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                      Appointments <Calendar className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-display text-3xl tabular-nums">{stats.appointments}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
