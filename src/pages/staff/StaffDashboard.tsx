import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  ListChecks,
  Package,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Job = { id: string; title: string; status: string; date: string; priority?: string | null };
type Appointment = { id: string; title: string | null; appointment_date: string; appointment_time: string };

const statusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  in_progress: "bg-tile-sky text-foreground/80",
  review: "bg-tile-blush text-foreground/80",
  completed: "bg-tile-sage text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
};

type QueueFilter = "active" | "in_progress" | "pending" | "completed";

export default function StaffDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ assigned: 0, inProgress: 0, pending: 0, completed: 0 });
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("active");
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const firstName = useMemo(() => {
    const full = (profile?.full_name || user?.email || "there").trim();
    return full.split(/\s+|@/)[0];
  }, [profile, user]);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const run = async () => {
      const [all, ip, pend, done, apptsRes] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id).eq("status", "in_progress"),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id).eq("status", "pending"),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id).eq("status", "completed"),
        appointmentsEnabled
          ? supabase
              .from("appointments")
              .select("id, title, appointment_date, appointment_time")
              .eq("appointment_date", startToday.toISOString().slice(0, 10))
              .order("appointment_time", { ascending: true })
              .limit(6)
          : Promise.resolve({ data: [] } as any),
      ]);

      setStats({
        assigned: all.count || 0,
        inProgress: ip.count || 0,
        pending: pend.count || 0,
        completed: done.count || 0,
      });
      setTodayAppts((apptsRes.data || []) as Appointment[]);
    };

    const fetchQueue = async () => {
      let q = supabase
        .from("jobs")
        .select("id, title, status, priority, created_at")
        .eq("assigned_staff_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (queueFilter === "active") q = q.not("status", "in", "(completed,cancelled)");
      else if (queueFilter === "in_progress") q = q.eq("status", "in_progress");
      else if (queueFilter === "pending") q = q.eq("status", "pending");
      else if (queueFilter === "completed") q = q.eq("status", "completed");
      const { data } = await q;
      setMyJobs(
        (data || []).map((j: any) => ({
          id: j.id,
          title: j.title,
          status: j.status,
          priority: j.priority,
          date: new Date(j.created_at).toLocaleDateString(),
        })),
      );
    };

    Promise.all([run(), fetchQueue()]).catch(() => {
      toast.error("Failed to load dashboard data. Please refresh.");
    }).finally(() => setIsLoading(false));
  }, [user, appointmentsEnabled, queueFilter]);

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
              <span>Hey, <span className="text-primary">{firstName}</span></span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Your work for today, in one calm view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="glow" size="sm"><Link to="/staff/kanban"><ListChecks className="h-4 w-4" />Open kanban</Link></Button>
            <Button asChild variant="soft" size="sm"><Link to="/staff/schedule"><Calendar className="h-4 w-4" />Schedule</Link></Button>
            <Button asChild variant="soft" size="sm"><Link to="/staff/inventory"><Package className="h-4 w-4" />Inventory</Link></Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-40 rounded-2xl col-span-2", i === 0 ? "lg:col-span-8" : i === 1 ? "lg:col-span-4" : "lg:col-span-3")} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(0,auto)]">
            {/* My jobs — hero */}
            <Card tone="cream" className="col-span-2 lg:col-span-8 lg:row-span-2">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">My queue</p>
                    <h3 className="mt-1 text-display text-2xl sm:text-3xl">Jobs</h3>
                  </div>
                  <Link to="/staff/jobs" className="text-xs font-medium text-primary hover:underline">All</Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-1 rounded-full border border-border/70 bg-card/60 p-1 text-[11px] sm:inline-flex sm:w-auto">
                  {(["active", "in_progress", "pending", "completed"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setQueueFilter(f)}
                      className={cn(
                        "rounded-full px-2.5 py-1 capitalize transition-colors min-h-[28px]",
                        queueFilter === f ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.replace("_", " ")}
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {myJobs.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                      Nothing in this view.
                    </div>
                  ) : (
                    myJobs.map((j) => (
                      <Link
                        key={j.id}
                        to={`/staff/jobs/${j.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-3 min-h-[52px] hover:bg-card"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{j.title}</p>
                          <p className="text-xs text-muted-foreground">{j.date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {j.priority && j.priority !== "normal" && (
                            <span className="rounded-full bg-tile-blush px-2 py-0.5 text-[11px] capitalize text-foreground/80">
                              {j.priority}
                            </span>
                          )}
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", statusTone[j.status] || "bg-muted")}>
                            {j.status.replace("_", " ")}
                          </span>
                        </div>
                      </Link>
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
                  <Link to="/staff/schedule" className="text-xs font-medium text-primary hover:underline">Open</Link>
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
                  Assigned <Briefcase className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.assigned}</p>
                <p className="mt-1 text-xs text-muted-foreground">All your jobs</p>
              </CardContent>
            </Card>
            <Card tone="sky" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  In progress <Clock className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.inProgress}</p>
                <p className="mt-1 text-xs text-muted-foreground">Currently working on</p>
              </CardContent>
            </Card>
            <Card tone="butter" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Pending <ListChecks className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.pending}</p>
                <p className="mt-1 text-xs text-muted-foreground">Waiting to start</p>
              </CardContent>
            </Card>
            <Card tone="blush" className="lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70 sm:text-xs">
                  Completed <CheckCircle2 className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-[2rem] leading-none tabular-nums sm:text-4xl">{stats.completed}</p>
                <p className="mt-1 text-xs text-muted-foreground">Great work!</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
