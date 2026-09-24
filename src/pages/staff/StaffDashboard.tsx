import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { Panel } from "@/components/dashboard/Panel";
import { StatusPill, JobStatusPill } from "@/components/dashboard/StatusPill";
import { StepTracker } from "@/components/dashboard/StepTracker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import { todayIso } from "@/lib/dashboardQueries";
import { cn } from "@/lib/utils";

type Job = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  estimated_hours: number | null;
};
type Appointment = { id: string; title: string | null; appointment_time: string; duration_minutes: number | null };

const STEPS = ["To do", "Working", "Review", "Done"];
const STEP_INDEX: Record<string, number> = { pending: 0, in_progress: 1, review: 2, completed: 3 };
/** Working jobs first, then jobs to start, then those waiting on sign-off. */
const STATUS_ORDER: Record<string, number> = { in_progress: 0, pending: 1, review: 2 };

const NEXT_ACTION: Record<string, { label: string; to: string; done: string } | undefined> = {
  pending: { label: "Start job", to: "in_progress", done: "Job started" },
  in_progress: { label: "Send for review", to: "review", done: "Sent for review" },
};

function dueLabel(due: string | null): { text: string; late: boolean } {
  if (!due) return { text: "No due date", late: false };
  const today = todayIso();
  const date = new Date(due).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (due < today) return { text: `Late · was due ${date}`, late: true };
  if (due === today) return { text: "Due today", late: false };
  return { text: `Due ${date}`, late: false };
}

function PriorityPill({ priority }: { priority: string | null }) {
  if (priority === "urgent") return <StatusPill tone="danger">Urgent</StatusPill>;
  if (priority === "high") return <StatusPill tone="warning">High priority</StatusPill>;
  return null;
}

/** Technician home screen: the job in hand, what's next, and today's bookings. Designed for a phone at the bench. */
export default function StaffDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [doneThisWeek, setDoneThisWeek] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const [jobsRes, doneRes, apptsRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, title, status, priority, due_date, estimated_hours")
        .eq("assigned_staff_id", user.id)
        .in("status", ["pending", "in_progress", "review"]),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("assigned_staff_id", user.id)
        .eq("status", "completed")
        .gte("updated_at", weekStart.toISOString()),
      appointmentsEnabled
        ? supabase
            .from("appointments")
            .select("id, title, appointment_time, duration_minutes, status")
            .eq("appointment_date", todayIso())
            .not("status", "in", "(completed,cancelled)")
            .order("appointment_time", { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    if (jobsRes.error) {
      toast.error("Couldn't load your jobs. Reload the page to try again.");
    }
    const sorted = ((jobsRes.data || []) as Job[]).sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
    );
    setJobs(sorted);
    setDoneThisWeek(doneRes.count || 0);
    setAppointments((apptsRes.data || []) as Appointment[]);
    setIsLoading(false);
  }, [user, appointmentsEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  const advance = async (job: Job) => {
    const action = NEXT_ACTION[job.status];
    if (!action || updating) return;
    setUpdating(job.id);
    const previous = jobs;
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, status: action.to } : j)));
    const { error } = await supabase.from("jobs").update({ status: action.to }).eq("id", job.id);
    setUpdating(null);
    if (error) {
      setJobs(previous);
      toast.error(`Couldn't update "${job.title}". Check your connection and try again.`);
      return;
    }
    toast.success(`${action.done}: ${job.title}`);
    load();
  };

  const [current, ...upNext] = jobs;
  const firstName = (profile?.full_name || "").split(" ")[0];
  const subtitle = [
    new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    firstName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-2xl space-y-4">
        <PageBar title="My day" subtitle={subtitle} />

        {isLoading ? (
          <>
            <Skeleton className="h-52 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </>
        ) : !current ? (
          <section className="rounded-lg border bg-card p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <h2 className="mt-2 font-sans text-lg font-semibold">No jobs assigned to you</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When a manager assigns you a job it will appear here. {doneThisWeek > 0 && `You've finished ${doneThisWeek} this week.`}
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/staff/kanban">Open the board</Link>
            </Button>
          </section>
        ) : (
          <>
            <CurrentJobCard job={current} busy={updating === current.id} onAdvance={() => advance(current)} />

            <Panel title="Up next" link={{ label: "All my jobs", to: "/staff/jobs" }}>
              {upNext.length === 0 ? (
                <p className="px-4 py-5 text-sm text-muted-foreground">Nothing else queued. {doneThisWeek > 0 && `${doneThisWeek} done this week.`}</p>
              ) : (
                <ul className="divide-y">
                  {upNext.map((job) => {
                    const due = dueLabel(job.due_date);
                    return (
                      <li key={job.id}>
                        <Link to={`/jobs/${job.id}`} className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/60">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{job.title}</span>
                            <span className={cn("text-xs", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>{due.text}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <PriorityPill priority={job.priority} />
                            <JobStatusPill status={job.status} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </>
        )}

        {appointmentsEnabled && !isLoading && (
          <Panel title="Today's bookings" link={{ label: "Schedule", to: "/staff/schedule" }}>
            {appointments.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">No bookings today.</p>
            ) : (
              <ul className="divide-y">
                {appointments.map((a) => (
                  <li key={a.id}>
                    <Link to={`/appointments/${a.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-secondary/60">
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="w-12 shrink-0 text-sm tabular-nums">{(a.appointment_time || "").slice(0, 5)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{a.title || "Appointment"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        {!isLoading && current && (
          <p className="text-center text-sm text-muted-foreground">
            {doneThisWeek > 0 ? `${doneThisWeek} ${doneThisWeek === 1 ? "job" : "jobs"} finished this week.` : "No jobs finished yet this week."}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}

function CurrentJobCard({ job, busy, onAdvance }: { job: Job; busy: boolean; onAdvance: () => void }) {
  const due = dueLabel(job.due_date);
  const action = NEXT_ACTION[job.status];
  const heading = job.status === "in_progress" ? "Working on" : job.status === "pending" ? "Up first" : "Waiting for sign-off";

  return (
    <section aria-label="Current job" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{heading}</span>
        <PriorityPill priority={job.priority} />
        {due.late && <StatusPill tone="danger">Late</StatusPill>}
      </div>
      <div>
        <h2 className="font-sans text-lg font-semibold leading-snug">{job.title}</h2>
        <p className={cn("mt-0.5 text-sm", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>
          {due.text}
          {job.estimated_hours ? ` · estimated ${job.estimated_hours} h` : ""}
        </p>
      </div>
      <StepTracker steps={STEPS} current={STEP_INDEX[job.status] ?? 0} />
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12">
          <Link to={`/jobs/${job.id}`}>Open job</Link>
        </Button>
        {action ? (
          <Button className="h-12" onClick={onAdvance} disabled={busy}>
            {busy ? "Saving…" : action.label}
          </Button>
        ) : (
          <p className="flex h-12 items-center justify-center rounded-md bg-secondary px-3 text-center text-sm text-muted-foreground">
            A manager will sign this off
          </p>
        )}
      </div>
    </section>
  );
}
