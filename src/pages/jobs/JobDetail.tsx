import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { jobEditSchema } from "@/lib/schemas/job";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, CalendarDays, Clock, Pencil, Plus, Trash2, CheckSquare,
  FileUp, FileText, Download, MessageSquare, Paperclip, Package, Send,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sendNotifications } from "@/lib/notifications";
import { notifyJobStatusChange } from "@/lib/jobNotifications";
import ProjectConversation from "@/components/project/ProjectConversation";
import ProjectActivity from "@/components/project/ProjectActivity";
import ProjectFiles from "@/components/project/ProjectFiles";
import ClientProjectView from "@/components/project/ClientProjectView";
import { JobStatusPill } from "@/components/dashboard/StatusPill";
import { projectPath, projectsListPath, projectStatusLabel } from "@/lib/projects";
import { useBreadcrumbLabel } from "@/lib/breadcrumbs";
import { generateJobReport } from "@/lib/jobReportPdf";
import { useCurrency } from "@/hooks/useCurrency";

// Statuses a team member can set by hand on this page.
const EDITABLE_STATUSES = ["quote", "pending", "in_progress", "review", "completed", "cancelled"];

const taskStatusColors: Record<string, "default" | "secondary" | "outline"> = {
  pending: "outline", in_progress: "secondary", completed: "default",
};

interface UserOption { id: string; full_name: string; }
interface TaskItem {
  id: string;
  title: string;
  status: string;
  assigned_to: string | null;
  assignee_name?: string | null;
}

const emptyTaskForm = { title: "", description: "", assigned_to: "", status: "pending", due_date: "", value: "" };

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { role, user } = useAuth();
  const { format: fmt } = useCurrency();
  const navigate = useNavigate();

  const [job, setJob] = useState<any>(null);
  const [staffName, setStaffName] = useState("—");
  const [clientName, setClientName] = useState("—");
  const [staffUsers, setStaffUsers] = useState<UserOption[]>([]);
  const [clientUsers, setClientUsers] = useState<UserOption[]>([]);

  // Tasks
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [taskForm, setTaskForm] = useState({ ...emptyTaskForm });
  const [taskPendingFiles, setTaskPendingFiles] = useState<File[]>([]);
  const taskCreateFileRef = useRef<HTMLInputElement>(null);
  const [handoffTask, setHandoffTask] = useState<TaskItem | null>(null);
  const [handoffAssignee, setHandoffAssignee] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [handingOff, setHandingOff] = useState(false);

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

  // Materials used
  const [materials, setMaterials] = useState<any[]>([]);
  const [matOpen, setMatOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [matForm, setMatForm] = useState({ item_id: "", quantity: "1", notes: "" });
  const [addingMat, setAddingMat] = useState(false);


  // Edit job
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});


  // Actual hours
  const [actualHoursInput, setActualHoursInput] = useState("");


  const canEdit = role === "admin" || role === "manager";
  const canAddUpdate = role === "admin" || role === "manager" || role === "staff";

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: jobData } = await supabase.from("jobs").select("*").eq("id", id).single();
      if (!jobData) return;
      setJob(jobData);
      setActualHoursInput(jobData.actual_hours?.toString() ?? "");

      const ids = [jobData.assigned_staff_id, jobData.client_id].filter((v): v is string => !!v);
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        profiles?.forEach((p) => {
          if (p.id === jobData.assigned_staff_id) setStaffName(p.full_name || "—");
          if (p.id === jobData.client_id) setClientName(p.full_name || "—");
        });
      }
    };
    load();
    if (role === "client") return;
    fetchTasks();
    fetchUsers();
    fetchMaterials();
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

  const fetchMaterials = async () => {
    const { data } = await supabase
      .from("inventory_transactions")
      .select("*, inventory_items(name, unit, unit_cost)")
      .eq("job_id", id!)
      .order("created_at");
    setMaterials(data || []);
  };

  const fetchInventoryItems = async () => {
    const { data } = await supabase.from("inventory_items").select("id, name, unit, unit_cost, quantity").order("name");
    setInventoryItems(data || []);
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

  const handleAddMaterial = async () => {
    if (!matForm.item_id) { toast.error("Select an item"); return; }
    const qty = parseInt(matForm.quantity);
    if (!qty || qty <= 0) { toast.error("Enter a valid quantity"); return; }
    setAddingMat(true);
    const item = inventoryItems.find(i => i.id === matForm.item_id);
    const { error } = await supabase.from("inventory_transactions").insert({
      item_id: matForm.item_id, job_id: id!, user_id: user!.id,
      type: "out", quantity: qty, notes: matForm.notes || null,
    });
    if (error) { toast.error(error.message); setAddingMat(false); return; }
    if (item) {
      await supabase.from("inventory_items").update({ quantity: Math.max(0, item.quantity - qty) }).eq("id", item.id);
    }
    toast.success("Material logged");
    setAddingMat(false);
    setMatOpen(false);
    setMatForm({ item_id: "", quantity: "1", notes: "" });
    fetchMaterials();
    fetchInventoryItems();
  };



  const handleStatusChange = async (status: string) => {
    if (!job) return;
    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    setJob({ ...job, status });
    toast.success(`Status changed to ${projectStatusLabel(status)}`);
    notifyJobStatusChange(job, status, user?.id);
  };

  const handleActualHoursBlur = async () => {
    if (!job) return;
    const val = actualHoursInput === "" ? null : parseFloat(actualHoursInput);
    if (val === job.actual_hours) return;
    const { error } = await supabase.from("jobs").update({ actual_hours: val }).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    setJob({ ...job, actual_hours: val });
    toast.success("Hours saved");
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

  const handleOpenAddTask = () => { setEditingTask(null); setTaskForm({ ...emptyTaskForm }); setTaskPendingFiles([]); setTaskOpen(true); };
  const handleOpenEditTask = (task: any) => {
    setEditingTask(task);
    setTaskForm({ title: task.title, description: task.description || "", assigned_to: task.assigned_to || "", status: task.status, due_date: task.due_date || "", value: task.value?.toString() || "" });
    setTaskOpen(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.title.trim()) { toast.error("Task title is required"); return; }
    const payload: any = { job_id: id!, title: taskForm.title.trim(), description: taskForm.description || null, assigned_to: taskForm.assigned_to || null, status: taskForm.status, due_date: taskForm.due_date || null, value: parseFloat(taskForm.value) || 0 };
    let newTaskId: string | null = null;
    if (editingTask) {
      const { error } = await supabase.from("job_tasks").update(payload).eq("id", editingTask.id);
      if (error) { toast.error(error.message); return; }
      newTaskId = editingTask.id;
      toast.success("Task updated");
    } else {
      const { data, error } = await supabase.from("job_tasks").insert(payload).select("id").single();
      if (error) { toast.error(error.message); return; }
      newTaskId = data.id;
      toast.success("Task added");
    }
    // Upload pending files for new task
    if (newTaskId && taskPendingFiles.length > 0) {
      for (const file of taskPendingFiles) {
        const ext = file.name.split(".").pop();
        const path = `${id}/${newTaskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
        if (uploadErr) { toast.error(`Failed to upload ${file.name}`); continue; }
        await (supabase.from as any)("job_attachments").insert({
          job_id: id!, task_id: newTaskId, uploaded_by: user!.id,
          file_name: file.name, file_path: path, file_type: file.type, file_size: file.size,
        });
      }
      if (taskPendingFiles.length > 0) toast.success(`${taskPendingFiles.length} file(s) attached`);
    }
    setTaskPendingFiles([]);
    setTaskOpen(false); setEditingTask(null); fetchTasks();
  };

  const handleTaskStatusChange = async (taskId: string, status: string) => {
    const { error } = await supabase.from("job_tasks").update({ status }).eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status } : t);
    setTasks(updatedTasks);

    // When a task is completed, notify the next incomplete task's assignee
    if (status === "completed") {
      const completedTask = tasks.find(t => t.id === taskId);
      const nextTask = updatedTasks
        .filter(t => t.id !== taskId && t.status !== "completed")
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

      if (nextTask?.assigned_to && nextTask.assigned_to !== user?.id) {
        await sendNotifications([{
          user_id: nextTask.assigned_to,
          title: "Your task is ready to start",
          message: `"${completedTask?.title}" is done. Your task "${nextTask.title}" on ${job?.ref} is next.`,
          link: projectPath(id!),
        }]);
      }
    }
  };

  const openHandoffDialog = (task: TaskItem) => {
    setHandoffTask(task);
    setHandoffAssignee("");
    setHandoffNote("");
  };

  const closeHandoffDialog = () => {
    if (handingOff) return;
    setHandoffTask(null);
    setHandoffAssignee("");
    setHandoffNote("");
  };

  const handleCompleteAndHandoff = async () => {
    if (!handoffTask || !user || !job) return;
    if (!handoffAssignee) { toast.error("Choose who to hand this task to"); return; }
    if (!handoffNote.trim()) { toast.error("Add a handoff note"); return; }

    const nextAssignee = staffUsers.find((staff) => staff.id === handoffAssignee);
    if (!nextAssignee) { toast.error("Selected staff member was not found"); return; }

    setHandingOff(true);
    const { error: taskError } = await supabase
      .from("job_tasks")
      .update({ status: "completed", assigned_to: handoffAssignee })
      .eq("id", handoffTask.id);

    if (taskError) {
      setHandingOff(false);
      toast.error(taskError.message);
      return;
    }

    const noteText = `Handoff to ${nextAssignee.full_name}: ${handoffNote.trim()}`;
    const { error: noteError } = await supabase.from("job_task_notes").insert({
      task_id: handoffTask.id,
      user_id: user.id,
      note: noteText,
    });

    if (noteError) {
      toast.error(`Task handed off, but note could not be saved: ${noteError.message}`);
    }

    await sendNotifications([{
      user_id: handoffAssignee,
      title: "Task handed off to you",
      message: `${user.email?.split("@")[0] ?? "A team member"} completed "${handoffTask.title}" and handed it off on ${job.ref}.`,
      link: projectPath(id!),
    }]);

    const updatedTask = {
      ...handoffTask,
      status: "completed",
      assigned_to: handoffAssignee,
      assignee_name: nextAssignee.full_name,
    };
    setTasks((prev) => prev.map((task) => task.id === handoffTask.id ? updatedTask : task));
    if (viewTask?.id === handoffTask.id) {
      setViewTask(updatedTask);
      fetchTaskDetails(handoffTask.id);
    }
    setHandingOff(false);
    setHandoffTask(null);
    setHandoffAssignee("");
    setHandoffNote("");
    toast.success(`Task completed and handed off to ${nextAssignee.full_name}`);
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase.from("job_tasks").delete().eq("id", taskId);
    if (error) { toast.error(error.message); return; }
    setTasks(prev => prev.filter(t => t.id !== taskId)); toast.success("Task removed");
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
  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const totalJobValue = tasks.reduce((sum, t) => sum + (parseFloat(t.value) || 0), 0);
  const completedJobValue = tasks.filter(t => t.status === "completed").reduce((sum, t) => sum + (parseFloat(t.value) || 0), 0);
  const taskProgress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : null;
  const matTotal = materials.reduce((sum, m) => sum + m.quantity * Number((m as any).inventory_items?.unit_cost || 0), 0);

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

        {job.source_request_id && (role === "admin" || role === "manager") && (
          <div className="rounded-md border border-border bg-primary-soft px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span className="text-foreground/80">This project started as a client request.</span>
            <Link to={`/admin/requests?focus=${job.source_request_id}`} className="text-primary font-medium hover:underline">
              View request →
            </Link>
          </div>
        )}

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
                <Label htmlFor="f-actual" className="text-xs text-muted-foreground">Actual</Label>
                {canAddUpdate ? (
                  <Input id="f-actual" type="number" min="0" step="0.5" value={actualHoursInput}
                    onChange={(e) => setActualHoursInput(e.target.value)}
                    onBlur={handleActualHoursBlur} className="mt-1 h-7 w-24 text-sm" placeholder="0" />
                ) : (
                  <p className="text-sm mt-1">{job.actual_hours ? `${job.actual_hours}h` : "—"}</p>
                )}
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

        {/* Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />Tasks
              </CardTitle>
              {tasks.length > 0 && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {completedTasks} of {tasks.length} completed{taskProgress !== null && ` · ${taskProgress}%`}
                  {totalJobValue > 0 && (
                    <span className="ml-2 font-medium text-foreground">{fmt(completedJobValue)} / {fmt(totalJobValue)}</span>
                  )}
                </p>
              )}
            </div>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={handleOpenAddTask}>
                <Plus className="mr-2 h-4 w-4" />Add Task
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No tasks yet.{canEdit && " Break the project into tasks and assign them to your team."}
              </p>
            ) : (
              <>
                {tasks.length > 1 && <Progress value={taskProgress ?? 0} aria-label="Tasks completed" className="h-1 mb-4" />}
                <div className="divide-y divide-border">
                  {tasks.map(task => {
                    const canChangeStatus = canEdit || task.assigned_to === user?.id;
                    const canHandOff = role === "staff" && task.assigned_to === user?.id && task.status !== "completed";
                    return (
                      <div key={task.id} className="flex items-start gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              className={cn("text-sm font-medium text-left hover:underline",
                                task.status === "completed" && "line-through text-muted-foreground")}
                              onClick={() => { setViewTask(task); setNewTaskNote(""); fetchTaskDetails(task.id); }}
                            >
                              {task.title}
                            </button>
                            {canChangeStatus ? (
                              <Select value={task.status} onValueChange={(v) => handleTaskStatusChange(task.id, v)}>
                                <SelectTrigger className="h-8 w-[120px] text-xs px-2" aria-label={`Status of task ${task.title}`}><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in_progress">In progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant={taskStatusColors[task.status]} className="text-xs">
                                {task.status.replace("_", " ")}
                              </Badge>
                            )}
                          </div>
                          {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <p className="text-xs text-muted-foreground">
                              {task.assignee_name ? `Assigned to ${task.assignee_name}` : "Unassigned"}
                            </p>
                            {task.due_date && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />Due {task.due_date}
                              </p>
                            )}
                            {parseFloat(task.value) > 0 && (
                              <Badge variant="outline" className="text-xs font-mono">{fmt(parseFloat(task.value))}</Badge>
                            )}
                          </div>
                        </div>
                        {(canHandOff || canEdit) && (
                          <div className="flex gap-1 shrink-0">
                            {canHandOff && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openHandoffDialog(task)}>
                                <Send className="mr-1 h-3 w-3" />
                                Hand off
                              </Button>
                            )}
                            {canEdit && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit task ${task.title}`} onClick={() => handleOpenEditTask(task)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label={`Delete task ${task.title}`}
                                  onClick={() => handleDeleteTask(task.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Materials Used */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />Materials Used
            </CardTitle>
            {canAddUpdate && (
              <Button size="sm" variant="outline" onClick={() => { setMatOpen(true); if (inventoryItems.length === 0) fetchInventoryItems(); }}>
                <Plus className="mr-2 h-4 w-4" />Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No materials logged yet.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead className="hidden sm:table-cell">Unit cost</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materials.map(m => {
                      const item = (m as any).inventory_items;
                      const lineTotal = m.quantity * Number(item?.unit_cost || 0);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{item?.name || "—"}</TableCell>
                          <TableCell>{m.quantity} {item?.unit || ""}</TableCell>
                          <TableCell className="hidden sm:table-cell">{fmt(Number(item?.unit_cost || 0))}</TableCell>
                          <TableCell>{fmt(lineTotal)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <p className="text-sm font-semibold text-right mt-2">
                  Materials total: {fmt(matTotal)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <ProjectConversation
          project={job}
          clientName={clientName !== "—" ? clientName : undefined}
          teamIds={tasks.map((t) => t.assigned_to).filter(Boolean)}
        />

        </div>{/* end left column */}

        {/* ── Right sidebar ── */}
        <div className="space-y-6">

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

        {/* Complete & Hand Off Dialog */}
        <Dialog open={!!handoffTask} onOpenChange={(open) => { if (!open) closeHandoffDialog(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Complete & hand off</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Task</Label>
                <p className="mt-1 text-sm font-medium">{handoffTask?.title}</p>
              </div>
              <div>
                <Label htmlFor="f-hand-off-to">Hand off to</Label>
                <Select value={handoffAssignee} onValueChange={setHandoffAssignee} disabled={handingOff}>
                  <SelectTrigger id="f-hand-off-to" className="mt-1">
                    <SelectValue placeholder="Select staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffUsers.filter((staff) => staff.id !== user?.id).map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>{staff.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {staffUsers.filter((staff) => staff.id !== user?.id).length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">No other staff members are available.</p>
                )}
              </div>
              <div>
                <Label htmlFor="f-handoff-note">Handoff note</Label>
                <Textarea id="f-handoff-note"
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder="Completed fabrication, passing to paint."
                  rows={3}
                  className="mt-1"
                  disabled={handingOff}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeHandoffDialog} disabled={handingOff}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCompleteAndHandoff}
                  disabled={handingOff || !handoffAssignee || !handoffNote.trim()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {handingOff ? "Handing off..." : "Complete & hand off"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add / Edit Task Dialog */}
        <Dialog open={taskOpen} onOpenChange={(v) => { setTaskOpen(v); if (!v) setEditingTask(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingTask ? "Edit Task" : "Add Task"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="f-title-2">Title</Label>
                <Input id="f-title-2" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="e.g. Change engine oil" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="f-description-optional">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea id="f-description-optional" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="mt-1" rows={2} />
              </div>
              <div>
                <Label htmlFor="f-assign-to">Assign To</Label>
                <Select value={taskForm.assigned_to || "__none__"} onValueChange={(v) => setTaskForm({ ...taskForm, assigned_to: v === "__none__" ? "" : v })}>
                  <SelectTrigger id="f-assign-to" className="mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-status-2">Status</Label>
                <Select value={taskForm.status} onValueChange={(v) => setTaskForm({ ...taskForm, status: v })}>
                  <SelectTrigger id="f-status-2" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-due-date-optional">Due Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <DatePickerInput id="f-due-date-optional" value={taskForm.due_date} onChange={(v) => setTaskForm({ ...taskForm, due_date: v })} className="mt-1" />
              </div>
              {canEdit && (
                <div>
                  <Label htmlFor="f-task-value-optional">Task Value ($) <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input id="f-task-value-optional" type="number" min="0" step="0.01" value={taskForm.value} onChange={(e) => setTaskForm({ ...taskForm, value: e.target.value })} className="mt-1 w-32" placeholder="0.00" />
                  <p className="text-xs text-muted-foreground mt-1">Counts toward the monthly company goal when completed.</p>
                </div>
              )}
              {!editingTask && (
                <div>
                  <Label>Attachments <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <input ref={taskCreateFileRef} type="file" multiple className="hidden" onChange={(e) => {
                    if (e.target.files) setTaskPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    e.target.value = "";
                  }} />
                  <Button type="button" variant="outline" size="sm" className="mt-1 w-full" onClick={() => taskCreateFileRef.current?.click()}>
                    <FileUp className="mr-2 h-4 w-4" />Add Files
                  </Button>
                  {taskPendingFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {taskPendingFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                          <span className="truncate">{f.name}</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Remove ${f.name}`} onClick={() => setTaskPendingFiles(prev => prev.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={handleSaveTask} className="w-full">{editingTask ? "Save Changes" : "Add Task"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Material Dialog */}
        <Dialog open={matOpen} onOpenChange={setMatOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Log Material Usage</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="f-item">Item</Label>
                <Select value={matForm.item_id} onValueChange={(v) => setMatForm({ ...matForm, item_id: v })}>
                  <SelectTrigger id="f-item" className="mt-1"><SelectValue placeholder="Select inventory item" /></SelectTrigger>
                  <SelectContent>
                    {inventoryItems.map(i => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} — {i.quantity} {i.unit} in stock
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-quantity-used">Quantity Used</Label>
                <Input id="f-quantity-used" type="number" min="1" value={matForm.quantity}
                  onChange={(e) => setMatForm({ ...matForm, quantity: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="f-notes-optional">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input id="f-notes-optional" value={matForm.notes} onChange={(e) => setMatForm({ ...matForm, notes: e.target.value })} className="mt-1" />
              </div>
              <Button onClick={handleAddMaterial} disabled={addingMat} className="w-full">
                {addingMat ? "Saving..." : "Log Usage"}
              </Button>
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
