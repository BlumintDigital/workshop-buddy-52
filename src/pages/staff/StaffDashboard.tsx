import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Clock, MoonStar, X, FolderOpen, Hand, Package, Pause, Play, Send } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { Panel } from "@/components/dashboard/Panel";
import { StatusPill, JobStatusPill } from "@/components/dashboard/StatusPill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickHandoff, type Task } from "@/components/project/ProjectTasks";
import { uploadProjectFile } from "@/lib/attachments";
import { RequestDialog } from "@/components/project/ProjectParts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { useNow } from "@/hooks/useVisibleInterval";
import { todayIso } from "@/lib/dashboardQueries";
import { projectPath } from "@/lib/projects";
import { plural } from "@/lib/format";
import { elapsedMs, formatElapsed, formatMinutes, isForgotten } from "@/lib/timer";
import { cn } from "@/lib/utils";

type ProjectRef = { id: string; ref: string; title: string; priority: string | null; due_date: string | null; status: string };
type MyTask = Task & { jobs: ProjectRef | null };
type Appointment = { id: string; title: string | null; appointment_time: string; duration_minutes: number | null };
type Timer = { task_id: string; started_at: string };

/** The note the server writes when it pauses a timer at closing time (timer_closing_time migration). */
const CLOSING_NOTE = "Timer (paused at closing time)";
const DISMISSED_KEY = "shoplane.myday.closing-notices";
function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

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
 * A technician's home screen, built for a phone at the bench: the task in hand with its timer,
 * the rest of their tasks, work waiting in their teams, and today's bookings.
 */
export default function StaffDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [handingOff, setHandingOff] = useState<MyTask | null>(null);
  const [requesting, setRequesting] = useState<MyTask | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-day", user?.id, appointmentsEnabled],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      if (!user) throw new Error("Signed out");
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const select = "*, jobs(id, ref, title, priority, due_date, status)";

      const { data: memberships } = await supabase.from("department_members").select("department_id, departments(name)").eq("user_id", user.id);
      const teamIds = (memberships ?? []).map((m) => m.department_id);

      const [mineRes, queueRes, leadRes, doneRes, apptsRes, timerRes, closedRes] = await Promise.all([
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
        supabase.from("task_timers").select("task_id, started_at").eq("user_id", user.id).maybeSingle(),
        // Timers the server paused at closing time this past week (see auto_pause_task_timers), so a
        // Friday-night pause still shows on Monday. Dismissed ones are hidden by id below.
        supabase
          .from("time_entries")
          .select("id, hours, job_tasks(title)")
          .eq("user_id", user.id)
          .eq("note", CLOSING_NOTE)
          .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      if (mineRes.error) toast.error("Couldn't load your tasks. Reload the page to try again.");
      const timer = (timerRes.data ?? null) as Timer | null;
      // Work only counts once the project is approved: nothing to do on quotes or cancelled projects.
      const live = (t: MyTask) => !!t.jobs && ["pending", "in_progress", "review"].includes(t.jobs.status);
      // The task being timed always comes first, so it's the task in hand.
      const timedFirst = (a: MyTask, b: MyTask) => Number(b.id === timer?.task_id) - Number(a.id === timer?.task_id) || byUrgency(a, b);
      return {
        mine: ((mineRes.data ?? []) as MyTask[]).filter(live).sort(timedFirst),
        queue: ((queueRes.data ?? []) as MyTask[]).filter(live).sort(byUrgency),
        leading: (leadRes.data ?? []) as ProjectRef[],
        teamNames: Object.fromEntries((memberships ?? []).map((m) => [m.department_id, (m.departments as { name: string } | null)?.name ?? "Team"])) as Record<string, string>,
        handedOff: doneRes.count ?? 0,
        appointments: (apptsRes.data ?? []) as Appointment[],
        timer,
        autoPaused: (closedRes.data ?? []).map((e) => ({ id: e.id, hours: Number(e.hours), title: (e.job_tasks as { title: string } | null)?.title ?? "a task" })),
      };
    },
  });
  const { mine = [], queue = [], leading = [], teamNames = {}, handedOff = 0, appointments = [], timer = null, autoPaused = [] } = data ?? {};
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const closedNotices = autoPaused.filter((e) => !dismissed.includes(e.id));
  const dismissClosed = () => {
    const next = [...dismissed, ...closedNotices.map((e) => e.id)].slice(-20);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the note just comes back on the next visit.
    }
  };
  const load = () => void queryClient.invalidateQueries({ queryKey: ["my-day", user?.id] });

  // Live: tasks given to you or your teams. Timers aren't broadcast (their delete events would
  // reach everyone), so start and pause refetch here instead.
  useRealtimeRefresh(user ? `my-day-${user.id}` : null, [{ table: "job_tasks" }], ["my-day", user?.id]);

  const start = async (t: MyTask) => {
    setBusy(t.id);
    const { error } = await supabase.rpc("start_task_timer", { _task_id: t.id });
    setBusy(null);
    if (error) return toast.error(`Couldn't start "${t.title}". Check your connection and try again.`);
    toast.success(`Started: ${t.title}`);
    load();
  };

  const pause = async (t: MyTask) => {
    setBusy(t.id);
    const { data: hours, error } = await supabase.rpc("stop_task_timer");
    setBusy(null);
    if (error) return toast.error("Couldn't pause the timer. Check your connection and try again.");
    const minutes = Math.round(Number(hours ?? 0) * 60);
    // The page can still show a timer the server already paused at closing time.
    if (minutes === 0 && timer && Date.now() - new Date(timer.started_at).getTime() > 60_000) {
      toast.info("This timer was already paused at closing time. Press Start to carry on.");
      return load();
    }
    toast.success(minutes > 0 ? `Paused. ${formatMinutes(minutes)} logged on "${t.title}".` : "Paused. Under a minute, so no time logged.");
    load();
  };

  const take = async (t: MyTask) => {
    setBusy(t.id);
    const { error } = await supabase.from("job_tasks").update({ assigned_to: user!.id }).eq("id", t.id).is("assigned_to", null);
    setBusy(null);
    if (error) return toast.error(`Couldn't take "${t.title}". Someone may have taken it already.`);
    toast.success(`"${t.title}" is yours`);
    load();
  };

  const [current, ...rest] = mine;
  const firstName = (profile?.full_name || "").split(" ")[0];
  const subtitle = [new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }), firstName].filter(Boolean).join(" · ");
  const leadingOnly = useMemo(() => leading.filter((p) => !mine.some((t) => t.job_id === p.id)), [leading, mine]);
  const timedTitle = timer ? mine.find((t) => t.id === timer.task_id)?.title : undefined;

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-2xl space-y-4">
        <PageBar title="My day" subtitle={subtitle} actions={timer && <RunningTimer timer={timer} title={timedTitle} />} />

        {closedNotices.length > 0 && (
          <section role="status" className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4">
            <MoonStar className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">Your timer was paused at closing time</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {closedNotices.map((e) => (
                  <li key={e.id}>
                    {formatMinutes(Math.round(e.hours * 60))} logged on "{e.title}", up to closing.
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-muted-foreground">If you worked later, add the extra time on the project. Press Start to carry on.</p>
            </div>
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={dismissClosed} aria-label="Dismiss">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </section>
        )}

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
            <TaskInHand
              task={current}
              team={current.department_id ? teamNames[current.department_id] : undefined}
              timer={timer?.task_id === current.id ? timer : null}
              busy={busy === current.id}
              onStart={() => void start(current)}
              onPause={() => void pause(current)}
              onHandOff={() => setHandingOff(current)}
              onRequestPart={() => setRequesting(current)}
            />
            {rest.length > 0 && (
              <Panel title="My other tasks" link={{ label: "My projects", to: "/staff/projects" }}>
                <ul className="divide-y">
                  {rest.map((t) => (
                    <TaskRow key={t.id} task={t}>
                      {t.status === "pending" ? (
                        <Button size="sm" variant="outline" className="h-11" disabled={busy === t.id} onClick={() => void start(t)}>
                          <Play className="mr-1 h-4 w-4" aria-hidden />
                          Start<span className="sr-only"> {t.title}</span>
                        </Button>
                      ) : (
                        <Button size="sm" className="h-11" onClick={() => setHandingOff(t)}>
                          <Send className="mr-1 h-4 w-4" aria-hidden />
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
                  <Button size="sm" variant="outline" className="h-11" disabled={busy === t.id} onClick={() => void take(t)}>
                    <Hand className="mr-1 h-4 w-4" aria-hidden />
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
            load();
          }}
        />
      )}

      {requesting?.jobs && (
        <RequestDialog project={{ id: requesting.job_id, ref: requesting.jobs.ref }} taskId={requesting.id} onClose={() => setRequesting(null)} onDone={() => setRequesting(null)} />
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

/** Running time, ticking once a second. Mounted only while a timer runs. */
function Elapsed({ startedAt, className }: { startedAt: string; className?: string }) {
  const now = useNow(1000);
  return <span className={cn("tabular-nums", className)}>{formatElapsed(elapsedMs(startedAt, now))}</span>;
}

/** A nudge when the timer has run past a working day, probably left on by mistake. */
function ForgottenTimer({ startedAt }: { startedAt: string }) {
  const now = useNow(60_000);
  if (!isForgotten(startedAt, now)) return null;
  const since = new Date(startedAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <p role="status" className="rounded-md bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
      Your timer has been running since {since}. Pause it and fix the hours on the project if needed.
    </p>
  );
}

/** The header's reminder that a timer is running, and on what. */
function RunningTimer({ timer, title }: { timer: Timer; title?: string }) {
  return (
    <p className="flex max-w-[16rem] items-center gap-2 rounded-full bg-success-soft py-1.5 pl-3 pr-4 text-success">
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">Timer running{title ? ` on ${title}` : ""}:</span>
      <Elapsed startedAt={timer.started_at} className="text-base font-semibold" />
      {title && (
        <span aria-hidden className="min-w-0 truncate text-sm">
          {title}
        </span>
      )}
    </p>
  );
}

function TaskInHand({
  task,
  team,
  timer,
  busy,
  onStart,
  onPause,
  onHandOff,
  onRequestPart,
}: {
  task: MyTask;
  team?: string;
  timer: Timer | null;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onHandOff: () => void;
  onRequestPart: () => void;
}) {
  const { user } = useAuth();
  const due = dueLabel(dueOf(task));
  const working = task.status === "in_progress";
  const photoInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setAdding(true);
    let done = 0;
    for (const file of Array.from(files)) {
      const error = await uploadProjectFile(task.job_id, "work", file, user.id);
      if (error) toast.error(`Couldn't add ${file.name}: ${error}`);
      else done++;
    }
    setAdding(false);
    if (photoInput.current) photoInput.current.value = "";
    if (done) toast.success(`${done === 1 ? "Photo" : `${done} photos`} added to ${task.jobs?.ref ?? "the project"}. Your team can see it in Files.`);
  };

  return (
    <section aria-label="Task in hand" className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{timer ? "Working on" : working ? "Paused" : "Up first"}</span>
        <PriorityPill priority={task.jobs?.priority} />
        {due.late && <StatusPill tone="danger">Late</StatusPill>}
        {task.rework_of && <StatusPill tone="warning">Rework</StatusPill>}
      </div>
      <div>
        <p className="font-mono text-xs text-muted-foreground">
          {task.jobs?.ref} · {task.jobs?.title}
        </p>
        <h2 className="font-sans text-xl font-semibold leading-snug">{task.title}</h2>
        {task.description && <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>}
        <p className={cn("mt-0.5 text-sm", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>
          {due.text}
          {task.estimated_hours ? ` · estimated ${task.estimated_hours} h` : ""}
          {team ? ` · ${team}` : ""}
        </p>
      </div>

      {timer && (
        <div className="rounded-md bg-success-soft px-4 py-3 text-success">
          <p className="text-sm font-medium">Time on this task</p>
          <Elapsed startedAt={timer.started_at} className="block text-5xl font-semibold leading-tight tracking-tight" />
        </div>
      )}
      {timer && <ForgottenTimer startedAt={timer.started_at} />}

      <div className="grid grid-cols-2 gap-2">
        {timer ? (
          <Button variant="outline" className="h-14 text-base [&_svg]:size-5" onClick={onPause} disabled={busy}>
            <Pause aria-hidden />
            {busy ? "Pausing…" : "Pause"}
          </Button>
        ) : (
          <Button variant={working ? "outline" : "default"} className="h-14 text-base [&_svg]:size-5" onClick={onStart} disabled={busy}>
            <Play aria-hidden />
            {busy ? "Starting…" : working ? "Resume" : "Start"}
          </Button>
        )}
        {working ? (
          <Button className="h-14 text-base [&_svg]:size-5" onClick={onHandOff}>
            <Send aria-hidden />
            Hand off
          </Button>
        ) : (
          <Button asChild variant="outline" className="h-14 text-base [&_svg]:size-5">
            <Link to={projectPath(task.job_id)}>
              <FolderOpen aria-hidden />
              Open project
            </Link>
          </Button>
        )}
      </div>

      <div className={cn("grid gap-2", working ? "grid-cols-3" : "grid-cols-2")}>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void addPhotos(e.target.files)}
        />
        <Button variant="outline" className="h-16 flex-col gap-1 px-1 text-sm [&_svg]:size-5" onClick={() => photoInput.current?.click()} disabled={adding}>
          <Camera aria-hidden />
          {adding ? "Adding…" : "Add photo"}
        </Button>
        <Button variant="outline" className="h-16 flex-col gap-1 px-1 text-sm [&_svg]:size-5" onClick={onRequestPart}>
          <Package aria-hidden />
          Request part
        </Button>
        {working && (
          <Button asChild variant="outline" className="h-16 flex-col gap-1 px-1 text-sm [&_svg]:size-5">
            <Link to={projectPath(task.job_id)}>
              <FolderOpen aria-hidden />
              Open project
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
