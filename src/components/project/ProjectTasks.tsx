import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Camera, CheckSquare, Clock, Hand, MoreHorizontal, Play, Plus, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { fetchProfileNames, relativeTime } from "@/lib/profileNames";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Task = {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: string;
  assigned_to: string | null;
  department_id: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  value: number | null;
  order_index: number | null;
  rework_of: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
};
type Handoff = { id: string; task_id: string; from_user: string; note: string; hours: number | null; next_task_id: string | null; created_at: string };
type Team = { id: string; name: string };
type Member = { department_id: string; user_id: string; is_lead: boolean };

const TASK_TONE: Record<string, StatusTone> = { pending: "neutral", in_progress: "info", completed: "success" };
const TASK_LABEL: Record<string, string> = { pending: "To do", in_progress: "In progress", completed: "Handed off" };

interface Props {
  project: { id: string; ref: string; title: string; status: string };
  /** Planners (and admins/managers) create, edit and assign any task. */
  canPlan: boolean;
  /** Called after anything that can change the project's status or hours. */
  onChanged?: () => void;
  /** Opens the notes-and-files view for a task. */
  onOpenTask?: (task: Task) => void;
}

/**
 * The project's work, split by team. Each task belongs to a team and then,
 * optionally, a person. Whoever does a task hands it off with a note, which
 * keeps them on record as its owner and tells whoever is next.
 */
export default function ProjectTasks({ project, canPlan, onChanged, onOpenTask }: Props) {
  const { user } = useAuth();
  const { format: fmt } = useCurrency();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [handingOff, setHandingOff] = useState<Task | null>(null);
  const [loggingTime, setLoggingTime] = useState<Task | null>(null);

  const load = useCallback(async () => {
    const [t, h, d, m] = await Promise.all([
      supabase.from("job_tasks").select("*").eq("job_id", project.id).order("order_index", { ascending: true, nullsFirst: false }).order("created_at"),
      supabase.from("task_handoffs").select("id, task_id, from_user, note, hours, next_task_id, created_at").eq("job_id", project.id).order("created_at"),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("department_members").select("department_id, user_id, is_lead"),
    ]);
    const taskRows = (t.data ?? []) as Task[];
    const memberRows = (m.data ?? []) as Member[];
    const ids = [...taskRows.map((x) => x.assigned_to), ...(h.data ?? []).map((x) => x.from_user), ...memberRows.map((x) => x.user_id)];
    setNames(await fetchProfileNames(ids));
    setTasks(taskRows);
    setHandoffs((h.data ?? []) as Handoff[]);
    setTeams(d.data ?? []);
    setMembers(memberRows);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`project-tasks-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_tasks", filter: `job_id=eq.${project.id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, project.id]);

  const teamName = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const myTeams = useMemo(() => new Set(members.filter((m) => m.user_id === user?.id).map((m) => m.department_id)), [members, user?.id]);
  const iLead = (teamId: string | null) => !!teamId && members.some((m) => m.department_id === teamId && m.user_id === user?.id && m.is_lead);
  const peopleIn = (teamId: string | null) =>
    teamId
      ? members.filter((m) => m.department_id === teamId).map((m) => m.user_id)
      : [...new Set(members.map((m) => m.user_id))];

  const done = tasks.filter((t) => t.status === "completed").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  // Group by team, keeping the order teams first appear in.
  const groups = useMemo(() => {
    const order: (string | null)[] = [];
    for (const t of tasks) if (!order.includes(t.department_id)) order.push(t.department_id);
    return order.map((id) => ({ id, name: id ? teamName[id] ?? "Team" : "No team", tasks: tasks.filter((t) => t.department_id === id) }));
  }, [tasks, teamName]);

  const update = async (task: Task, patch: Partial<Task>, success: string) => {
    const { error } = await supabase.from("job_tasks").update(patch).eq("id", task.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(success);
    void load();
    onChanged?.();
  };

  const remove = async (task: Task) => {
    const { error } = await supabase.from("job_tasks").delete().eq("id", task.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Removed "${task.title}"`);
    void load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckSquare className="h-5 w-5" aria-hidden />
            Tasks
          </CardTitle>
          {tasks.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {done} of {tasks.length} handed off
            </p>
          )}
        </div>
        {canPlan && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Add task
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks yet.
            {canPlan ? " Split the work into tasks and give each one to a team." : " The project planner will add tasks here."}
          </p>
        ) : (
          <>
            {tasks.length > 1 && <Progress value={progress} aria-label="Tasks handed off" className="h-1.5" />}
            {groups.map((g) => (
              <section key={g.id ?? "none"} aria-label={g.name}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</h3>
                <ul className="divide-y rounded-md border">
                  {g.tasks.map((task) => {
                    const mine = task.assigned_to === user?.id;
                    const claimable = !task.assigned_to && !!task.department_id && myTeams.has(task.department_id) && task.status !== "completed";
                    const open = task.status !== "completed";
                    const canHandOff = open && (mine || claimable || canPlan);
                    const canAssign = open && (canPlan || iLead(task.department_id));
                    const handoff = [...handoffs].reverse().find((h) => h.task_id === task.id);
                    const next = handoff?.next_task_id ? tasks.find((t) => t.id === handoff.next_task_id) : null;
                    return (
                      <li key={task.id} className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={cn("text-left text-sm font-medium hover:underline", !open && "text-muted-foreground")}
                                onClick={() => onOpenTask?.(task)}
                              >
                                {task.title}
                              </button>
                              <StatusPill tone={TASK_TONE[task.status] ?? "neutral"}>{TASK_LABEL[task.status] ?? task.status}</StatusPill>
                              {task.rework_of && (
                                <StatusPill tone="warning">
                                  <RotateCcw className="h-3 w-3" aria-hidden />
                                  Rework
                                </StatusPill>
                              )}
                            </div>
                            {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              <span>{task.assigned_to ? (mine ? "You" : names[task.assigned_to] ?? "Team member") : task.department_id ? `Anyone in ${teamName[task.department_id] ?? "the team"}` : "Unassigned"}</span>
                              {task.due_date && (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" aria-hidden />
                                  Due {formatDate(task.due_date)}
                                </span>
                              )}
                              {task.estimated_hours != null && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" aria-hidden />
                                  {task.estimated_hours} h estimated
                                </span>
                              )}
                              {canPlan && Number(task.value) > 0 && <span>{fmt(Number(task.value))}</span>}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {mine && task.status === "pending" && (
                              <Button size="sm" variant="outline" className="h-9" onClick={() => void update(task, { status: "in_progress" }, `Started "${task.title}"`)}>
                                <Play className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Start
                              </Button>
                            )}
                            {claimable && (
                              <Button size="sm" variant="outline" className="h-9" onClick={() => void update(task, { assigned_to: user!.id }, `"${task.title}" is yours`)}>
                                <Hand className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Take it
                              </Button>
                            )}
                            {canHandOff && (mine || canPlan) && (
                              <Button size="sm" className="h-9" onClick={() => setHandingOff(task)}>
                                <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Hand off
                              </Button>
                            )}
                            {(mine || canAssign || canPlan) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`More actions for ${task.title}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {(mine || canPlan) && <DropdownMenuItem onClick={() => setLoggingTime(task)}>Log time</DropdownMenuItem>}
                                  {canPlan && <DropdownMenuItem onClick={() => setEditing(task)}>Edit task</DropdownMenuItem>}
                                  {canAssign && !canPlan && (
                                    <DropdownMenuItem onClick={() => setEditing(task)}>Assign to someone in the team</DropdownMenuItem>
                                  )}
                                  {canPlan && !open && (
                                    <DropdownMenuItem onClick={() => void update(task, { status: "in_progress", completed_at: null }, `Reopened "${task.title}"`)}>
                                      Reopen task
                                    </DropdownMenuItem>
                                  )}
                                  {canPlan && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive" onClick={() => void remove(task)}>
                                        Delete task
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                        {handoff && (
                          <div className="rounded-md bg-secondary px-3 py-2 text-sm">
                            <p className="text-xs text-muted-foreground">
                              Handed off by {handoff.from_user === user?.id ? "you" : names[handoff.from_user] ?? "a team member"} · {relativeTime(handoff.created_at)}
                              {handoff.hours ? ` · ${handoff.hours} h` : ""}
                              {next ? ` · next: ${next.title}` : ""}
                            </p>
                            <p className="mt-0.5 whitespace-pre-line">{handoff.note}</p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </CardContent>

      {editing && (
        <TaskDialog
          projectId={project.id}
          task={editing === "new" ? null : editing}
          teams={teams}
          peopleIn={peopleIn}
          names={names}
          assignOnly={editing !== "new" && !canPlan}
          nextOrder={tasks.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {handingOff && (
        <HandoffDialog
          project={project}
          task={handingOff}
          nextOptions={tasks.filter((t) => t.id !== handingOff.id && t.status !== "completed")}
          teamName={teamName}
          names={names}
          onClose={() => setHandingOff(null)}
          onDone={() => {
            setHandingOff(null);
            void load();
            onChanged?.();
          }}
        />
      )}
      {loggingTime && (
        <TimeDialog
          projectId={project.id}
          task={loggingTime}
          onClose={() => setLoggingTime(null)}
          onDone={() => {
            setLoggingTime(null);
            onChanged?.();
          }}
        />
      )}
    </Card>
  );
}

const NONE = "__none__";

function TaskDialog({
  projectId,
  task,
  teams,
  peopleIn,
  names,
  assignOnly,
  nextOrder,
  onClose,
  onSaved,
}: {
  projectId: string;
  task: Task | null;
  teams: Team[];
  peopleIn: (teamId: string | null) => string[];
  names: Record<string, string>;
  /** A team lead can only change who in the team does the task. */
  assignOnly: boolean;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    department_id: task?.department_id ?? NONE,
    assigned_to: task?.assigned_to ?? NONE,
    due_date: task?.due_date ?? "",
    estimated_hours: task?.estimated_hours != null ? String(task.estimated_hours) : "",
  });
  const [saving, setSaving] = useState(false);
  const teamId = form.department_id === NONE ? null : form.department_id;
  const people = peopleIn(teamId).sort((a, b) => (names[a] ?? "").localeCompare(names[b] ?? ""));

  const save = async () => {
    if (!form.title.trim()) return toast.error("Give the task a title");
    setSaving(true);
    const assignee = form.assigned_to === NONE ? null : form.assigned_to;
    const payload = assignOnly
      ? { assigned_to: assignee }
      : {
          job_id: projectId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          department_id: teamId,
          assigned_to: assignee,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
          ...(task ? {} : { order_index: nextOrder }),
        };
    const { error } = task ? await supabase.from("job_tasks").update(payload).eq("id", task.id) : await supabase.from("job_tasks").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (assignee && assignee !== task?.assigned_to) {
      void supabase.from("notifications").insert({
        user_id: assignee,
        title: "New task for you",
        message: form.title.trim(),
        link: `/projects/${projectId}`,
        read: false,
      });
    }
    toast.success(task ? "Task saved" : "Task added");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assignOnly ? `Assign "${task?.title}"` : task ? "Edit task" : "Add a task"}</DialogTitle>
          {!assignOnly && <DialogDescription>Give the task to a team. Pick a person too, or leave it for anyone in the team to take.</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          {!assignOnly && (
            <>
              <div>
                <Label htmlFor="f-task-title">Task</Label>
                <Input id="f-task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Machine new spindle sleeve" />
              </div>
              <div>
                <Label htmlFor="f-task-description">Details (optional)</Label>
                <Textarea id="f-task-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label htmlFor="f-task-team">Team</Label>
                <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v, assigned_to: NONE })}>
                  <SelectTrigger id="f-task-team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div>
            <Label htmlFor="f-task-person">Person</Label>
            <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
              <SelectTrigger id="f-task-person">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{teamId ? "Anyone in the team" : "Nobody yet"}</SelectItem>
                {people.map((id) => (
                  <SelectItem key={id} value={id}>
                    {names[id] ?? "Team member"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {people.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Nobody is in this team yet. Add people in Teams and access.</p>}
          </div>
          {!assignOnly && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="f-task-due">Due (optional)</Label>
                <DatePickerInput id="f-task-due" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
              </div>
              <div>
                <Label htmlFor="f-task-hours">Estimated hours</Label>
                <Input id="f-task-hours" type="number" min={0} step={0.5} value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} aria-describedby="f-task-hours-hint" />
                <p id="f-task-hours-hint" className="mt-1 text-xs text-muted-foreground">Also shares the quote's value between tasks on Goals.</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : task ? "Save" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoffDialog({
  project,
  task,
  nextOptions,
  teamName,
  names,
  onClose,
  onDone,
}: {
  project: { id: string; ref: string };
  task: Task;
  nextOptions: Task[];
  teamName: Record<string, string>;
  names: Record<string, string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [hours, setHours] = useState("");
  const [next, setNext] = useState(nextOptions[0]?.id ?? NONE);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const remainingAfter = nextOptions.length;

  const submit = async () => {
    if (!note.trim()) return toast.error("Say what you did and anything the next person should know");
    const h = hours ? Number(hours) : null;
    if (h !== null && (!(h > 0) || h > 24)) return toast.error("Hours must be between 0 and 24");
    setSaving(true);
    const { error } = await supabase.rpc("handoff_task", {
      _task_id: task.id,
      _note: note.trim(),
      _hours: h ?? undefined,
      _next_task_id: next === NONE ? undefined : next,
    });
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    for (const file of photos) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `${project.id}/${task.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (upErr) continue;
      await supabase.from("job_attachments").insert({
        job_id: project.id,
        task_id: task.id,
        uploaded_by: user!.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || "image/jpeg",
        file_size: file.size,
        kind: "handoff",
      });
    }
    setSaving(false);
    toast.success(remainingAfter === 0 ? "Handed off. Every task is done, so the project is ready for its quality check." : "Handed off");
    onDone();
  };

  const nextLabel = (t: Task) => {
    const who = t.assigned_to ? names[t.assigned_to] : t.department_id ? teamName[t.department_id] : null;
    return who ? `${t.title} (${who})` : t.title;
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hand off "{task.title}"</DialogTitle>
          <DialogDescription>This marks the task done under your name and tells whoever is next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="f-handoff-note">What was done</Label>
            <Textarea
              id="f-handoff-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Sleeve machined to 40.02 mm and pressed in. Check runout before painting."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="f-handoff-hours">Hours spent (optional)</Label>
              <Input id="f-handoff-hours" type="number" min={0} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="f-handoff-next">Next step</Label>
              <Select value={next} onValueChange={setNext}>
                <SelectTrigger id="f-handoff-next">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{remainingAfter === 0 ? "Quality check" : "Nobody in particular"}</SelectItem>
                  {nextOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {nextLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" aria-hidden />
              {photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""} added` : "Add photos (optional)"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !note.trim()}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden />
            {saving ? "Handing off…" : "Hand off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeDialog({ projectId, task, onClose, onDone }: { projectId: string; task: Task; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const h = Number(hours);
    if (!(h > 0) || h > 24) return toast.error("Enter between 0 and 24 hours");
    setSaving(true);
    const { error } = await supabase.from("time_entries").insert({ job_id: projectId, task_id: task.id, user_id: user!.id, hours: h, work_date: date || today, note: note.trim() || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${h} h logged on "${task.title}"`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-time-hours">Hours</Label>
              <Input id="f-time-hours" type="number" min={0.25} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} autoFocus />
            </div>
            <div>
              <Label htmlFor="f-time-date">Day</Label>
              <DatePickerInput id="f-time-date" value={date} onChange={setDate} />
            </div>
          </div>
          <div>
            <Label htmlFor="f-time-note">Note (optional)</Label>
            <Input id="f-time-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Log time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hand off a task from outside the project page (e.g. My day): loads the
 * project's other open tasks and the names needed to pick the next step.
 */
export function QuickHandoff({ task, project, onClose, onDone }: { task: Task; project: { id: string; ref: string }; onClose: () => void; onDone: () => void }) {
  const [ctx, setCtx] = useState<{ options: Task[]; teamName: Record<string, string>; names: Record<string, string> } | null>(null);
  useEffect(() => {
    void (async () => {
      const [t, d] = await Promise.all([
        supabase.from("job_tasks").select("*").eq("job_id", project.id).neq("status", "completed").neq("id", task.id).order("order_index", { ascending: true, nullsFirst: false }),
        supabase.from("departments").select("id, name"),
      ]);
      const options = (t.data ?? []) as Task[];
      setCtx({
        options,
        teamName: Object.fromEntries((d.data ?? []).map((x) => [x.id, x.name])),
        names: await fetchProfileNames(options.map((o) => o.assigned_to)),
      });
    })();
  }, [project.id, task.id]);
  if (!ctx) return null;
  return <HandoffDialog project={project} task={task} nextOptions={ctx.options} teamName={ctx.teamName} names={ctx.names} onClose={onClose} onDone={onDone} />;
}
