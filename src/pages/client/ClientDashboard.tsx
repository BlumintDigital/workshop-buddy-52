import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  FileText,
  Receipt,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Job = { id: string; title: string; status: string; date: string };
type Invoice = { id: string; total: number; base_total?: number | null; currency?: string | null; status: string; created_at: string };
type Appointment = { id: string; title: string | null; appointment_date: string; appointment_time: string };

const statusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  in_progress: "bg-tile-sky text-foreground/80",
  review: "bg-tile-blush text-foreground/80",
  completed: "bg-tile-sage text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
};

const invoiceTone: Record<string, string> = {
  paid: "bg-tile-sage text-foreground/80",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-tile-sky text-foreground/80",
  overdue: "bg-tile-blush text-foreground/80",
};

export default function ClientDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { user, profile } = useAuth();
  const { format } = useCurrency();

  const [stats, setStats] = useState({ jobs: 0, openJobs: 0, appointments: 0, invoices: 0, unpaid: 0, balance: 0 });
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [jobsFilter, setJobsFilter] = useState<"active" | "completed" | "all">("active");
  const [upcomingAppts, setUpcomingAppts] = useState<Appointment[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const firstName = useMemo(() => {
    const full = (profile?.full_name || user?.email || "there").trim();
    return full.split(/\s+|@/)[0];
  }, [profile, user]);

  // Clients are companies — prefer the company name in the greeting so it reads
  // "Welcome, Acme Limited" instead of the contact person's first name.
  const greetingName = useMemo(() => {
    const company = profile?.company_name?.trim();
    if (company) return company;
    return firstName;
  }, [profile, firstName]);

  const missingContactDetails = useMemo(() => {
    if (!profile) return [] as string[];
    const missing: string[] = [];
    if (!profile.company_name?.trim()) missing.push("company name");
    if (!profile.phone?.trim()) missing.push("phone number");
    if (!profile.address?.trim()) missing.push("address");
    return missing;
  }, [profile]);


  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const run = async () => {
      const [jobsCnt, openJobsCnt, apptsCnt, invsCnt, apptsRes, invRes] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("client_id", user.id),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("client_id", user.id).not("status", "in", "(completed,cancelled)"),
        appointmentsEnabled
          ? supabase.from("appointments").select("*", { count: "exact", head: true }).eq("client_id", user.id)
          : Promise.resolve({ count: 0 } as any),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("client_id", user.id).in("status", ["sent", "paid", "overdue"]),
        appointmentsEnabled
          ? supabase
              .from("appointments")
              .select("id, title, appointment_date, appointment_time")
              .eq("client_id", user.id)
              .gte("appointment_date", today)
              .order("appointment_date", { ascending: true })
              .order("appointment_time", { ascending: true })
              .limit(4)
          : Promise.resolve({ data: [] } as any),
        supabase
          .from("invoices")
          .select("id, total, base_total, currency, status, created_at")
          .eq("client_id", user.id)
          .in("status", ["sent", "overdue"])
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      const open = (invRes.data || []) as Invoice[];
      // Sum balance in workshop base currency for accuracy across currencies
      const balance = open.reduce((sum, i) => sum + (Number(i.base_total ?? i.total) || 0), 0);

      setStats({
        jobs: jobsCnt.count || 0,
        openJobs: openJobsCnt.count || 0,
        appointments: apptsCnt.count || 0,
        invoices: invsCnt.count || 0,
        unpaid: open.length,
        balance,
      });
      setUpcomingAppts((apptsRes.data || []) as Appointment[]);
      setOpenInvoices(open);
    };

    const fetchJobs = async () => {
      let q = supabase
        .from("jobs")
        .select("id, title, status, created_at")
        .eq("client_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (jobsFilter === "active") q = q.not("status", "in", "(completed,cancelled)");
      else if (jobsFilter === "completed") q = q.eq("status", "completed");
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

    Promise.all([run(), fetchJobs()]).finally(() => setIsLoading(false));
  }, [user, appointmentsEnabled, jobsFilter]);

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 className="mt-1 flex items-center gap-3 text-display text-4xl leading-tight sm:text-5xl">
              <Avatar className="h-10 w-10 sm:h-14 sm:w-14 ring-2 ring-primary/20 shrink-0">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={firstName} />}
                <AvatarFallback className="bg-primary/10 text-primary text-base sm:text-xl font-semibold">
                  {firstName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>Welcome, <span className="text-primary">{firstName}</span></span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Your jobs, appointments, and invoices in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="glow" size="sm"><Link to="/client/requests"><FileText className="h-4 w-4" />Request quote or job</Link></Button>
            {appointmentsEnabled && (
              <Button asChild variant="soft" size="sm"><Link to="/client/appointments"><CalendarPlus className="h-4 w-4" />Book appointment</Link></Button>
            )}
            <Button asChild variant="soft" size="sm"><Link to="/client/invoices"><Receipt className="h-4 w-4" />Invoices</Link></Button>
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
            {/* Balance hero */}
            <Card tone="cream" className="col-span-2 lg:col-span-8 lg:row-span-2">
              <CardContent className="flex h-full flex-col gap-6 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Outstanding balance</p>
                    <p className="mt-2 text-display text-[2.25rem] leading-none tabular-nums sm:text-5xl lg:text-6xl break-words">
                      {format(stats.balance)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {stats.unpaid === 0 ? "All caught up — nothing due." : `${stats.unpaid} invoice${stats.unpaid === 1 ? "" : "s"} awaiting payment`}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-tile-sage p-3">
                    <Receipt className="h-5 w-5 text-foreground/70" />
                  </div>
                </div>
                <div className="mt-auto space-y-2">
                  {openInvoices.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                      No open invoices.
                    </div>
                  ) : (
                    openInvoices.map((inv) => (
                      <Link
                        key={inv.id}
                        to={`/client/invoices/${inv.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-card/70 px-3 py-3 min-h-[52px] hover:bg-card"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">Invoice #{inv.id.slice(0, 8)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">{format(Number(inv.total) || 0, inv.currency || undefined)}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", invoiceTone[inv.status] || "bg-muted")}>
                            {inv.status}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming appointments */}
            <Card tone="mist" className="col-span-2 lg:col-span-4 lg:row-span-2">
              <CardContent className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Upcoming</p>
                    <h3 className="text-display text-2xl">Appointments</h3>
                  </div>
                  {appointmentsEnabled && (
                    <Link to="/client/appointments" className="text-xs text-primary hover:underline">All</Link>
                  )}
                </div>
                <div className="mt-5 flex-1 space-y-2 overflow-auto">
                  {!appointmentsEnabled ? (
                    <p className="py-4 text-sm text-muted-foreground">Appointments are not enabled.</p>
                  ) : upcomingAppts.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                      <Calendar className="h-6 w-6 text-primary" />
                      No upcoming appointments.
                    </div>
                  ) : (
                    upcomingAppts.map((a) => (
                      <div key={a.id} className="rounded-xl bg-card/70 px-3 py-2.5">
                        <p className="truncate text-sm font-medium">{a.title || "Appointment"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.appointment_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          {" · "}
                          {(a.appointment_time || "").slice(0, 5)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card tone="sage" className="col-span-1 lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-foreground/70">
                  Open jobs <Briefcase className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-4xl tabular-nums">{stats.openJobs}</p>
                <Link to="/client/jobs" className="mt-2 inline-block text-xs text-primary hover:underline">View →</Link>
              </CardContent>
            </Card>
            <Card tone="sky" className="col-span-1 lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-foreground/70">
                  Total jobs <FileText className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-4xl tabular-nums">{stats.jobs}</p>
                <p className="mt-1 text-xs text-muted-foreground">All time</p>
              </CardContent>
            </Card>
            <Card tone="butter" className="col-span-1 lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-foreground/70">
                  Invoices <Receipt className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-4xl tabular-nums">{stats.invoices}</p>
                <Link to="/client/invoices" className="mt-2 inline-block text-xs text-primary hover:underline">View →</Link>
              </CardContent>
            </Card>
            <Card tone="blush" className="col-span-1 lg:col-span-3">
              <CardContent className="p-5">
                <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-foreground/70">
                  Appointments <Calendar className="h-4 w-4" />
                </div>
                <p className="mt-3 text-display text-4xl tabular-nums">{stats.appointments}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total booked</p>
              </CardContent>
            </Card>

            {/* Recent jobs full width */}
            <Card tone="default" className="col-span-2 lg:col-span-12">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Recent</p>
                    <h3 className="mt-1 text-display text-2xl">Your jobs</h3>
                  </div>
                  <Link to="/client/jobs" className="text-xs text-primary hover:underline">All</Link>
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
                        to={`/client/jobs/${j.id}`}
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
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
