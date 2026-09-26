import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { jobEditSchema } from "@/lib/schemas/job";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, CalendarDays, Clock, Pencil, Trash2,
  FileUp, FileText, Download, MessageSquare, Paperclip,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";
import { notifyJobStatusChange } from "@/lib/jobNotifications";
import ProjectConversation from "@/components/project/ProjectConversation";
import ProjectTasks from "@/components/project/ProjectTasks";
import ProjectParts from "@/components/project/ProjectParts";
import ShipmentPanel from "@/components/shipping/ShipmentPanel";
import { usePermissions } from "@/hooks/usePermissions";
import ProjectActivity from "@/components/project/ProjectActivity";
import ProjectFiles from "@/components/project/ProjectFiles";
import ClientProjectView from "@/components/project/ClientProjectView";
import { JobStatusPill } from "@/components/dashboard/StatusPill";
import { PROJECT_STATUSES, projectPath, projectsListPath, projectStatusLabel } from "@/lib/projects";
import ProjectQuotes from "@/components/project/ProjectQuotes";
import ProjectStageActions from "@/components/project/ProjectStageActions";
import IntakeDetails from "@/components/project/IntakeDetails";
import { useBreadcrumbLabel } from "@/lib/breadcrumbs";
import { generateJobReport } from "@/lib/jobReportPdf";

// Admins and managers can override the stage by hand; everyone else moves it with the stage actions.
const EDITABLE_STATUSES = PROJECT_STATUSES;

interface UserOption { id: string; full_name: string; }
export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { role, user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<any>(null);
  const [staffName, setStaffName] = useState("—");
  const [clientName, setClientName] = useState("—");
  const [staffUsers, setStaffUsers] = useState<UserOption[]>([]);
  const [clientUsers, setClientUsers] = useState<UserOption[]>([]);

  // Tasks
  const [tasks, setTasks] = useState<any[]>([]);
  // Task detail (notes + files)
  const [viewTask, setViewTask] = useState<any | null>(null);
  const [taskNotes, setTaskNotes] = useState<any[]>([]);
  const [newTaskNote, setNewTaskNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);

  // Task attachments
  const [uploadingTask, setUploadingTask] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [generatingReport, setGeneratingReport] = useState(false);
  const taskFileInputRef = useRef<HTMLInputElement>(null);


  // Edit job
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});


  const canEdit = role === "admin" || role === "manager";
  const { has } = usePermissions();
  const canPlan = canEdit || has("planning");
  const canQuote = canEdit || has("reception") || has("planning");
  const canQuality = canEdit || has("quality");
  const isStores = has("inventory");
  const [receivedBy, setReceivedBy] = useState<string | undefined>();
  const canAddUpdate = role === "admin" || role === "manager" || role === "staff";

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: jobData } = await supabase.from("jobs").select("*").eq("id", id).single();
      if (!jobData) return;
      setJob(jobData);

      const ids = [jobData.assigned_staff_id, jobData.client_id, jobData.received_by].filter((v): v is string => !!v);
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        profiles?.forEach((p) => {
          if (p.id === jobData.assigned_staff_id) setStaffName(p.full_name || "—");
          if (p.id === jobData.client_id) setClientName(p.full_name || "—");
          if (p.id === jobData.received_by) setReceivedBy(p.full_name || undefined);
        });
      }
    };
    load();
    if (role === "client") return;
    fetchTasks();
    fetchUsers();
  }, [id, role]);

  useBreadcrumbLabel(projectPath(id ?? ""), job?.ref);

  // Mark any unread notifications that link to this job as read
  useEffect(() => {
    if (!id || !user?.id) return;
    void supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .in("link", [`/jobs/${id}`, projectPath(id)]);
  }, [id, user?.id]);

  // Real-time job status updates
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`job-detail-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${id}` },
        (payload) => setJob((prev: any) => prev ? { ...prev, ...payload.new } : prev))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["staff", "client"]);
    if (!roles) return;
    const allIds = [...new Set(roles.map(r => r.user_id))];
    if (allIds.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", allIds);
    if (!profiles) return;
    const profileMap = new Map(profiles.map(p => [p.id, p.full_name || "Unknown"]));
    setStaffUsers(roles.filter(r => r.role === "staff").map(r => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
    setClientUsers(roles.filter(r => r.role === "client").map(r => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
  };

  // Status and logged hours change when tasks are handed off or time is logged.
  const reloadJob = async () => {
    if (!id) return;
    const { data } = await supabase.from("jobs").select("*").eq("id", id).single();
    if (data) setJob(data);
    fetchTasks();
  };

  const fetchTasks = async () => {
    const { data } = await supabase.from("job_tasks").select("*").eq("job_id", id as string).order("created_at");
    if (!data) return;
    const assigneeIds = [...new Set(data.filter(t => t.assigned_to).map(t => t.assigned_to as string))];
    let nameMap: Record<string, string> = {};
    if (assigneeIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", assigneeIds);
      if (profiles) profiles.forEach(p => { nameMap[p.id] = p.full_name || "Unknown"; });
    }
    setTasks(data.map(t => ({ ...t, assignee_name: t.assigned_to ? nameMap[t.assigned_to] || "Unknown" : null })));
  };


  const fetchTaskDetails = async (taskId: string) => {
    const [{ data: notes }, { data: files }] = await Promise.all([
      (supabase.from as any)("job_task_notes").select("*").eq("task_id", taskId).order("created_at"),
      (supabase.from as any)("job_attachments").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    ]);
    const noteList = notes || [];
    const authorIds = [...new Set(noteList.map((n: any) => n.user_id))] as string[];
    let authorMap: Record<string, string> = {};
    if (authorIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
      if (profiles) profiles.forEach(p => { authorMap[p.id] = p.full_name || "Unknown"; });
    }
    setTaskNotes(noteList.map((n: any) => ({ ...n, author_name: authorMap[n.user_id] || "Unknown" })));
    const fileList = files || [];
    setTaskAttachments(fileList);
    if (fileList.length > 0) generateSignedUrls(fileList);
  };

  // Storage helpers
  const generateSignedUrls = async (attachments: any[]) => {
    const newUrls: Record<string, string> = {};
    await Promise.all(
      attachments.map(async (a) => {
        const { data } = await supabase.storage.from("job-attachments").createSignedUrl(a.file_path, 3600);
        if (data?.signedUrl) newUrls[a.file_path] = data.signedUrl;
      })
    );
    setSignedUrls(prev => ({ ...prev, ...newUrls }));
  };
  const getFileUrl = (path: string) => signedUrls[path] || "";
  const isImage = (type: string) => type.startsWith("image/");


  const handleUploadTaskFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewTask) return;
    setUploadingTask(true);
    const ext = file.name.split(".").pop();
    const path = `${id}/${viewTask.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
    if (uploadErr) { toast.error(uploadErr.message); setUploadingTask(false); return; }
    await (supabase.from as any)("job_attachments").insert({
      job_id: id!, task_id: viewTask.id, uploaded_by: user!.id,
      file_name: file.name, file_path: path, file_type: file.type, file_size: file.size,
    });
    toast.success("File uploaded");
    setUploadingTask(false);
    fetchTaskDetails(viewTask.id);
    e.target.value = "";
  };

  const handleDeleteAttachment = async (attachmentId: string, filePath: string, isTaskLevel: boolean) => {
    await supabase.storage.from("job-attachments").remove([filePath]);
    await (supabase.from as any)("job_attachments").delete().eq("id", attachmentId);
    if (isTaskLevel && viewTask) fetchTaskDetails(viewTask.id);
    toast.success("File removed");
  };

  const handleAddTaskNote = async () => {
    if (!newTaskNote.trim() || !viewTask) return;
    setAddingNote(true);
    const { error } = await (supabase.from as any)("job_task_notes").insert({
      task_id: viewTask.id, user_id: user!.id, note: newTaskNote.trim(),
    });
    setAddingNote(false);
    if (error) { toast.error(error.message); return; }
    setNewTaskNote("");
    fetchTaskDetails(viewTask.id);
  };

  const handleStatusChange = async (status: string) => {
    if (!job) return;
    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    setJob({ ...job, status });
    toast.success(`Status changed to ${projectStatusLabel(status)}`);
    notifyJobStatusChange(job, status, user?.id);
  };

  const handleOpenEdit = () => {
    if (!job) return;
    setEditForm({
      title: job.title, description: job.description || "", priority: job.priority,
      due_date: job.due_date || "", estimated_hours: job.estimated_hours?.toString() || "",
      assigned_staff_id: job.assigned_staff_id || "", client_id: job.client_id || "",
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!job) return;
    const validation = jobEditSchema.safeParse({
      ...editForm,
      estimated_hours: editForm.estimated_hours ? parseFloat(editForm.estimated_hours as string) : null,
      assigned_staff_id: editForm.assigned_staff_id || null,
      client_id: editForm.client_id || null,
    });
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Please fix form errors");
      return;
    }
    const payload: any = {
      title: editForm.title, description: editForm.description || null, priority: editForm.priority,
      due_date: editForm.due_date || null,
      estimated_hours: editForm.estimated_hours ? parseFloat(editForm.estimated_hours) : null,
      assigned_staff_id: editForm.assigned_staff_id || null, client_id: editForm.client_id || null,
    };
    const { error } = await supabase.from("jobs").update(payload).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    setJob({ ...job, ...payload }); setEditOpen(false); toast.success("Project updated");
  };

  if (!job) return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl" aria-busy="true">
        <h1 className="sr-only">Loading project…</h1>
        <Skeleton className="h-8 w-28" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-8 w-32 shrink-0" />
        </div>
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </DashboardLayout>
  );

  if (role === "client") {
    return (
      <DashboardLayout>
        <ClientProjectView project={job} onStatusChange={(status) => setJob({ ...job, status })} />
      </DashboardLayout>
    );
  }

  const backPath = projectsListPath(role);
  const canUploadIntake = canEdit || job.assigned_staff_id === user?.id;
  const hoursProgress = job.estimated_hours && job.actual_hours
    ? Math.min(100, (parseFloat(job.actual_hours) / parseFloat(job.estimated_hours)) * 100) : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to projects
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary-soft px-2 py-0.5 font-mono text-sm font-medium text-primary">{job.ref}</span>
              <JobStatusPill status={job.status} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <p className="max-w-prose whitespace-pre-line text-sm text-muted-foreground">{job.description || "No description"}</p>
          </div>
          {canEdit && (
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Button variant="outline" size="sm" disabled={generatingReport} onClick={async () => {
                setGeneratingReport(true);
                await generateJobReport(job.id);
                setGeneratingReport(false);
              }}>
                <Download className="mr-2 h-3 w-3" />{generatingReport ? "Generating…" : "Project report"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenEdit}>
                <Pencil className="mr-2 h-3 w-3" />Edit
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/invoices/new?jobId=${job.id}`}>Create invoice</Link>
              </Button>
            </div>
          )}
        </div>

        <ProjectStageActions
          project={job}
          tasks={tasks}
          can={{ quote: canQuote, plan: canPlan, quality: canQuality }}
          onChanged={reloadJob}
        />

        {/* ── 2-column grid: left = main content, right = sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">

        {/* Status / Priority / Assignment */}
        <Card>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="f-status" className="text-xs text-muted-foreground">Status</Label>
              {canEdit ? (
                <Select value={job.status} onValueChange={handleStatusChange}>
                  <SelectTrigger id="f-status" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{projectStatusLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-1"><JobStatusPill status={job.status} /></div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <p className="capitalize mt-1 text-sm font-medium">{job.priority}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Lead technician</Label>
              <p className="mt-1 text-sm">{staffName}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Client</Label>
              <p className="mt-1 text-sm">{clientName}</p>
            </div>
          </CardContent>
        </Card>

        {/* Dates / Hours */}
        <Card>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <p className="text-sm">{job.due_date || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">Estimated</Label>
                <p className="text-sm">{job.estimated_hours ? `${job.estimated_hours}h` : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-5" />
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Logged</Label>
                <p className="text-sm mt-1 tabular-nums">{job.actual_hours ? `${job.actual_hours} h` : "—"}</p>
                {hoursProgress !== null && (
                  <div className="mt-2">
                    <Progress value={hoursProgress} aria-label="Hours used against estimate" className="h-1.5 w-24" />
                    <p className="text-xs text-muted-foreground mt-0.5">{Math.round(hoursProgress)}% of estimate</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <ProjectQuotes project={job} canQuote={canQuote} onChanged={reloadJob} />

        <ProjectTasks
          project={job}
          canPlan={canPlan}
          onChanged={reloadJob}
          onOpenTask={(task) => { setViewTask(task); setNewTaskNote(""); fetchTaskDetails(task.id); }}
        />

        <ProjectParts project={job} isStores={isStores} onChanged={reloadJob} />

        <ProjectConversation
          project={job}
          clientName={clientName !== "—" ? clientName : undefined}
          teamIds={tasks.map((t) => t.assigned_to).filter(Boolean)}
        />

        </div>{/* end left column */}

        {/* ── Right sidebar ── */}
        <div className="space-y-6">

        <ShipmentPanel project={job} canShip={has("shipping")} onChanged={reloadJob} />

        <IntakeDetails project={job} receivedBy={receivedBy} />

        <ProjectFiles
          jobId={job.id}
          title="Condition on arrival"
          description="Photos taken when the machine was received. The client can see these."
          kinds={["intake"]}
          uploadKind={canUploadIntake ? "intake" : undefined}
          photos
          canDelete={() => role === "admin"}
          emptyText="No arrival photos yet. Add them when the machine comes in."
        />

        <ProjectFiles
          jobId={job.id}
          title="Files"
          description="Team only unless you share a file with the client."
          kinds={["work", "shared", "client", "delivery"]}
          uploadKind="work"
          canShare={canEdit}
          canDelete={(a) => canEdit || a.uploaded_by === user?.id}
          emptyText="No files yet."
        />

        <ProjectActivity jobId={job.id} createdAt={job.created_at} refreshKey={job.status} />

        </div>{/* end right column */}
        </div>{/* end grid */}

        {/* Edit Job Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit project</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label htmlFor="f-title">Title</Label><Input id="f-title" value={editForm.title || ""} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
              <div><Label htmlFor="f-description">Description</Label><Textarea id="f-description" value={editForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="f-priority">Priority</Label>
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                    <SelectTrigger id="f-priority" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["low", "medium", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label htmlFor="f-due-date">Due Date</Label><DatePickerInput id="f-due-date" value={editForm.due_date || ""} onChange={(v) => setEditForm({ ...editForm, due_date: v })} className="mt-1" /></div>
              </div>
              <div>
                <Label htmlFor="f-estimated-hours">Estimated Hours</Label>
                <Input id="f-estimated-hours" type="number" min="0" step="0.5" value={editForm.estimated_hours || ""} onChange={(e) => setEditForm({ ...editForm, estimated_hours: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="f-assign-staff">Assign Staff</Label>
                <Select value={editForm.assigned_staff_id || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, assigned_staff_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger id="f-assign-staff" className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-assign-client">Assign Client</Label>
                <Select value={editForm.client_id || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, client_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger id="f-assign-client" className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {clientUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveEdit} className="w-full">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Task Detail Dialog (notes + files) */}
        <Dialog open={!!viewTask} onOpenChange={(v) => { if (!v) { setViewTask(null); setTaskNotes([]); setTaskAttachments([]); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{viewTask?.title}</DialogTitle></DialogHeader>
            {viewTask?.description && <p className="text-sm text-muted-foreground -mt-2 mb-1">{viewTask.description}</p>}
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />Notes
                </h4>
                {taskNotes.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {taskNotes.map(n => (
                      <div key={n.id} className="border-l-2 border-border pl-3">
                        <p className="text-sm">{n.note}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.author_name} · {new Date(n.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
                {taskNotes.length === 0 && <p className="text-sm text-muted-foreground mb-3">No notes yet.</p>}
                {canAddUpdate && (
                  <div className="space-y-2">
                    <Textarea aria-label="Task note" placeholder="Add a note..." value={newTaskNote} onChange={(e) => setNewTaskNote(e.target.value)} rows={2} />
                    <Button size="sm" disabled={addingNote || !newTaskNote.trim()} onClick={handleAddTaskNote}>
                      {addingNote ? "Saving..." : "Add Note"}
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />Files
                  </h4>
                  {canAddUpdate && (
                    <Button size="sm" variant="outline" disabled={uploadingTask} onClick={() => taskFileInputRef.current?.click()}>
                      <FileUp className="mr-2 h-3 w-3" />{uploadingTask ? "Uploading..." : "Upload"}
                    </Button>
                  )}
                </div>
                <input ref={taskFileInputRef} type="file" className="hidden" onChange={handleUploadTaskFile} />
                {taskAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files attached.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {taskAttachments.map(a => (
                      <div key={a.id} className="relative group border rounded-lg overflow-hidden">
                        {isImage(a.file_type) ? (
                          <img src={getFileUrl(a.file_path)} alt={a.file_name} className="w-full h-20 object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-20 flex items-center justify-center bg-muted">
                            <FileText className="h-7 w-7 text-muted-foreground" />
                          </div>
                        )}
                        <div className="p-1.5"><p className="text-xs truncate">{a.file_name}</p></div>
                        <div className="absolute top-1 right-1 flex gap-1 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                          <a href={getFileUrl(a.file_path)} target="_blank" rel="noreferrer">
                            <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={`Download ${a.file_name}`}><Download className="h-4 w-4" /></Button>
                          </a>
                          {canEdit && (
                            <Button size="icon" variant="destructive" className="h-8 w-8" aria-label={`Delete ${a.file_name}`}
                              onClick={() => handleDeleteAttachment(a.id, a.file_path, true)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
