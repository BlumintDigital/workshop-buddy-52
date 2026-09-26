import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Hand, Play, Send } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { Panel } from "@/components/dashboard/Panel";
import { StatusPill, JobStatusPill } from "@/components/dashboard/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickHandoff, type Task } from "@/components/project/ProjectTasks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import { todayIso } from "@/lib/dashboardQueries";
import { projectPath } from "@/lib/projects";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProjectRef = { id: string; ref: string; title: string; priority: string | null; due_date: string | null; status: string };
type MyTask = Task & { jobs: ProjectRef | null };
type Appointment = { id: string; title: string | null; appointment_time: string; duration_minutes: number | null };

function dueLabel(due: string | null): { text: string; late: boolean } {
  if (!due) return { text: "No due date", late: false };
  const today = todayIso();
  const date = new Date(due).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (due < today) return { text: `Late · was due ${date}`, late: true };
  if (due === today) return { text: "Due today", late: false };
  return { text: `Due ${date}`, late: false };
}

function PriorityPill({ priority }: { priority: string | null | undefined }) {
  if (priority === "urgent") return <StatusPill tone="danger">Urgent</StatusPill>;
  if (priority === "high") return <StatusPill tone="warning">High priority</StatusPill>;
  return null;
}

/** A task's own due date, or its project's. */
const dueOf = (t: MyTask) => t.due_date ?? t.jobs?.due_date ?? null;
const PRIORITY: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const byUrgency = (a: MyTask, b: MyTask) =>
  (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) ||
  (PRIORITY[a.jobs?.priority ?? "medium"] ?? 2) - (PRIORITY[b.jobs?.priority ?? "medium"] ?? 2) ||
  (dueOf(a) ?? "9999").localeCompare(dueOf(b) ?? "9999");

/**
 * A technician's home screen, built for a phone at the bench: the task in hand,
 * the rest of their tasks, work waiting in their teams, and today's bookings.
 */
export default function StaffDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { user, profile } = useAuth();
  const [mine, setMine] = useState<MyTask[]>([]);
  const [queue, setQueue] = useState<MyTask[]>([]);
  const [leading, setLeading] = useState<ProjectRef[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [handedOff, setHandedOff] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState<MyTask | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const select = "*, jobs(id, ref, title, priority, due_date, status)";

    const { data: memberships } = await supabase.from("department_members").select("department_id, departments(name)").eq("user_id", user.id);
    const teamIds = (memberships ?? []).map((m) => m.department_id);
    setTeamNames(Object.fromEntries((memberships ?? []).map((m) => [m.department_id, (m.departments as { name: string } | null)?.name ?? "Team"])));

    const [mineRes, queueRes, leadRes, doneRes, apptsRes] = await Promise.all([
      supabase.from("job_tasks").select(select).eq("assigned_to", user.id).neq("status", "completed"),
      teamIds.length
        ? supabase.from("job_tasks").select(select).is("assigned_to", null).in("department_id", teamIds).neq("status", "completed")
        : Promise.resolve({ data: [] as MyTask[], error: null }),
      supabase.from("jobs").select("id, ref, title, priority, due_date, status").eq("assigned_staff_id", user.id).in("status", ["pending", "in_progress", "review"]).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("task_handoffs").select("id", { count: "exact", head: true }).eq("from_user", user.id).gte("created_at", weekStart.toISOString()),
      appointmentsEnabled
        ? supabase
            .from("appointments")
            .select("id, title, appointment_time, duration_minutes, status")
            .eq("appointment_date", todayIso())
            .not("status", "in", "(completed,cancelled)")
            .order("appointment_time", { ascending: true })
        : Promise.resolve({ data: [] as Appointment[] }),
    ]);
    if (mineRes.error) toast.error("Couldn't load your tasks. Reload the page to try again.");
    // Work only counts once the project is approved: nothing to do on quotes or cancelled projects.
    const live = (t: MyTask) => !!t.jobs && ["pending", "in_progress", "review"].includes(t.jobs.status);
    setMine(((mineRes.data ?? []) as MyTask[]).filter(live).sort(byUrgency));
    setQueue(((queueRes.data ?? []) as MyTask[]).filter(live).sort(byUrgency));
    setLeading((leadRes.data ?? []) as ProjectRef[]);
    setHandedOff(doneRes.count ?? 0);
    setAppointments((apptsRes.data ?? []) as Appointment[]);
    setIsLoading(false);
  }, [user, appointmentsEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async (t: MyTask) => {
    setBusy(t.id);
    const { error } = await supabase.from("job_tasks").update({ status: "in_progress" }).eq("id", t.id);
    setBusy(null);
    if (error) return toast.error(`Couldn't start "${t.title}". Check your connection and try again.`);
    toast.success(`Started: ${t.title}`);
    void load();
  };

  const take = async (t: MyTask) => {
    setBusy(t.id);
    const { error } = await supabase.from("job_tasks").update({ assigned_to: user!.id }).eq("id", t.id).is("assigned_to", null);
    setBusy(null);
    if (error) return toast.error(`Couldn't take "${t.title}". Someone may have taken it already.`);
    toast.success(`"${t.title}" is yours`);
    void load();
  };

  const [current, ...rest] = mine;
  const firstName = (profile?.full_name || "").split(" ")[0];
  const subtitle = [new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }), firstName].filter(Boolean).join(" · ");
  const leadingOnly = useMemo(() => leading.filter((p) => !mine.some((t) => t.job_id === p.id)), [leading, mine]);

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
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden />
            <h2 className="mt-2 font-sans text-lg font-semibold">No tasks assigned to you</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {queue.length > 0 ? "Pick something up from your team's queue below." : "When a planner gives you a task it appears here."}
              {handedOff > 0 && ` You've handed off ${plural(handedOff, "task")} this week.`}
            </p>
          </section>
        ) : (
          <>
            <TaskInHand task={current} team={current.department_id ? teamNames[current.department_id] : undefined} busy={busy === current.id} onStart={() => void start(current)} onHandOff={() => setHandingOff(current)} />
            {rest.length > 0 && (
              <Panel title="My other tasks" link={{ label: "My projects", to: "/staff/projects" }}>
                <ul className="divide-y">
                  {rest.map((t) => (
                    <TaskRow key={t.id} task={t}>
                      {t.status === "pending" ? (
                        <Button size="sm" variant="outline" className="h-10" disabled={busy === t.id} onClick={() => void start(t)}>
                          <Play className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Start<span className="sr-only"> {t.title}</span>
                        </Button>
                      ) : (
                        <Button size="sm" className="h-10" onClick={() => setHandingOff(t)}>
                          <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Hand off<span className="sr-only"> {t.title}</span>
                        </Button>
                      )}
                    </TaskRow>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}

        {!isLoading && queue.length > 0 && (
          <Panel title="Waiting in your teams">
            <ul className="divide-y">
              {queue.map((t) => (
                <TaskRow key={t.id} task={t} team={t.department_id ? teamNames[t.department_id] : undefined}>
                  <Button size="sm" variant="outline" className="h-10" disabled={busy === t.id} onClick={() => void take(t)}>
                    <Hand className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Take it<span className="sr-only">: {t.title}</span>
                  </Button>
                </TaskRow>
              ))}
            </ul>
          </Panel>
        )}

        {!isLoading && leadingOnly.length > 0 && (
          <Panel title="Projects you lead">
            <ul className="divide-y">
              {leadingOnly.map((p) => (
                <li key={p.id}>
                  <Link to={projectPath(p.id)} className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/60">
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-muted-foreground">{p.ref}</span>
                      <span className="block truncate text-sm font-medium">{p.title}</span>
                    </span>
                    <JobStatusPill status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
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
            {handedOff > 0 ? `${plural(handedOff, "task")} handed off this week.` : "Nothing handed off yet this week."}
          </p>
        )}
      </div>

      {handingOff?.jobs && (
        <QuickHandoff
          task={handingOff}
          project={{ id: handingOff.job_id, ref: handingOff.jobs.ref }}
          onClose={() => setHandingOff(null)}
          onDone={() => {
            setHandingOff(null);
            void load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function TaskRow({ task, team, children }: { task: MyTask; team?: string; children: React.ReactNode }) {
  const due = dueLabel(dueOf(task));
  return (
    <li className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3">
      <Link to={projectPath(task.job_id)} className="min-w-0 hover:underline">
        <span className="block font-mono text-xs text-muted-foreground">
          {task.jobs?.ref}
          {team && ` · ${team}`}
        </span>
        <span className="block truncate text-sm font-medium">{task.title}</span>
        <span className={cn("text-xs", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>
          {task.jobs?.title} · {due.text}
        </span>
      </Link>
      <span className="flex shrink-0 items-center gap-1.5">
        <PriorityPill priority={task.jobs?.priority} />
        {children}
      </span>
    </li>
  );
}

function TaskInHand({ task, team, busy, onStart, onHandOff }: { task: MyTask; team?: string; busy: boolean; onStart: () => void; onHandOff: () => void }) {
  const due = dueLabel(dueOf(task));
  const working = task.status === "in_progress";
  return (
    <section aria-label="Task in hand" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{working ? "Working on" : "Up first"}</span>
        <PriorityPill priority={task.jobs?.priority} />
        {due.late && <StatusPill tone="danger">Late</StatusPill>}
        {task.rework_of && <StatusPill tone="warning">Rework</StatusPill>}
      </div>
      <div>
        <p className="font-mono text-xs text-muted-foreground">
          {task.jobs?.ref} · {task.jobs?.title}
        </p>
        <h2 className="font-sans text-lg font-semibold leading-snug">{task.title}</h2>
        {task.description && <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>}
        <p className={cn("mt-0.5 text-sm", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>
          {due.text}
          {task.estimated_hours ? ` · estimated ${task.estimated_hours} h` : ""}
          {team ? ` · ${team}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12">
          <Link to={projectPath(task.job_id)}>Open project</Link>
        </Button>
        {working ? (
          <Button className="h-12" onClick={onHandOff}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            Hand off
          </Button>
        ) : (
          <Button className="h-12" onClick={onStart} disabled={busy}>
            <Play className="mr-1.5 h-4 w-4" aria-hidden />
            {busy ? "Starting…" : "Start"}
          </Button>
        )}
      </div>
    </section>
  );
}
