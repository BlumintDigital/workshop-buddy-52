import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { appointmentSchema } from "@/lib/schemas/appointment";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Briefcase, Download, FileText } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Checkbox } from "@/components/ui/checkbox";
import { generateICS, downloadICS } from "@/lib/ical";
import { toast } from "sonner";
import { sendEmail, appointmentConfirmedEmailHtml } from "@/lib/email";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";
import { todayIso } from "@/lib/dashboardQueries";

const APPT_TONE: Record<string, StatusTone> = {
  pending: "neutral", confirmed: "info", in_progress: "info", completed: "success", cancelled: "neutral",
};
const APPT_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Confirmed", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};

function formatDate(iso: string) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—";
}

const APPT_TYPES = ["consultation", "repair", "inspection", "pickup", "delivery"];
const APPT_STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled"];

interface UserOption { id: string; full_name: string; }

const emptyForm = {
  title: "", client_id: "", appointment_date: "", appointment_time: "",
  type: "consultation", duration_minutes: "60", notes: "",
};

const emptyJobForm = {
  title: "", description: "", priority: "medium", assigned_staff_id: "", due_date: "", isQuote: false,
};

export default function AdminAppointments() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [clients, setClients] = useState<UserOption[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserOption[]>([]);

  // Appointment create/edit dialog
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Convert appointment → job dialog
  const [jobDialogAppt, setJobDialogAppt] = useState<any | null>(null);
  const [jobForm, setJobForm] = useState({ ...emptyJobForm });
  const [creatingJob, setCreatingJob] = useState(false);

  const { page, setPage, reset } = usePagination();
  const [filter, setFilter] = useState("upcoming");

  const fetchAppointments = async (currentPage = page, currentFilter = filter) => {
    setIsLoading(true);
    const today = todayIso();
    let query = supabase.from("appointments").select("*", { count: "exact" });
    if (currentFilter === "upcoming") {
      query = query.gte("appointment_date", today).not("status", "in", "(completed,cancelled)")
        .order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true });
    } else if (currentFilter === "today") {
      query = query.eq("appointment_date", today).order("appointment_time", { ascending: true });
    } else if (currentFilter === "past") {
      query = query.lt("appointment_date", today).order("appointment_date", { ascending: false });
    } else {
      query = query.order("appointment_date", { ascending: false });
    }
    const { data: appts, count } = await query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    setTotalCount(count ?? 0);
    if (!appts) { setAppointments([]); setIsLoading(false); return; }

    const clientIds = [...new Set(appts.map(a => a.client_id).filter(Boolean))];
    let clientMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", clientIds);
      if (profiles) profiles.forEach(p => { clientMap[p.id] = p.full_name || "Unknown"; });
    }
    setAppointments(appts.map(a => ({ ...a, client_name: clientMap[a.client_id] || "—" })));
    setIsLoading(false);
  };

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["client", "staff"]);
    if (!roles) return;
    const allIds = [...new Set(roles.map(r => r.user_id))];
    if (allIds.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", allIds);
    if (!profiles) return;
    const profileMap = new Map(profiles.map(p => [p.id, p.full_name || "Unknown"]));
    setClients(roles.filter(r => r.role === "client").map(r => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
    setStaffUsers(roles.filter(r => r.role === "staff").map(r => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
  };

  useEffect(() => {
    fetchAppointments(page, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);
  useEffect(() => { fetchUsers(); }, []);

  // Appointment save (create or update)
  const handleSave = async () => {
    const validation = appointmentSchema.safeParse({
      ...form,
      duration_minutes: parseInt(form.duration_minutes) || 60,
    });
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Please fix form errors");
      return;
    }
    const payload = {
      title: form.title,
      client_id: form.client_id,
      appointment_date: form.appointment_date,
      appointment_time: form.appointment_time,
      type: form.type,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      notes: form.notes || null,
    };

    if (editItem) {
      const { error } = await supabase.from("appointments").update(payload).eq("id", editItem.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Appointment updated");
    } else {
      const { error } = await supabase.from("appointments").insert({ ...payload, status: "pending" });
      if (error) { toast.error(error.message); return; }
      toast.success("Appointment created");
      if (form.client_id) {
        sendEmail({
          to_user_id: form.client_id,
          subject: `Appointment confirmed: ${form.title}`,
          html: appointmentConfirmedEmailHtml(form.title, form.appointment_date, form.appointment_time),
        }).catch(() => {});
      }
    }

    setOpen(false);
    setEditItem(null);
    setForm({ ...emptyForm });
    fetchAppointments(page);
  };

  const handleOpenEdit = (appt: any) => {
    setEditItem(appt);
    setForm({
      title: appt.title,
      client_id: appt.client_id,
      appointment_date: appt.appointment_date,
      appointment_time: appt.appointment_time,
      type: appt.type || "consultation",
      duration_minutes: appt.duration_minutes?.toString() || "60",
      notes: appt.notes || "",
    });
    setOpen(true);
  };

  const handleStatusChange = async (id: string, status: string) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("appointments").delete().eq("id", deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success("Appointment deleted");
    setDeleteId(null);
    fetchAppointments(page);
  };

  // Open the "Create Job" dialog pre-filled from this appointment
  const handleOpenCreateJob = (appt: any) => {
    setJobDialogAppt(appt);
    setJobForm({
      title: appt.title,
      description: appt.notes || "",
      priority: "medium",
      assigned_staff_id: "",
      due_date: "",
      isQuote: false,
    });
  };

  // Create a job from the appointment and mark appointment as confirmed
  const handleCreateJob = async () => {
    if (!jobDialogAppt || !jobForm.title.trim()) {
      toast.error("Give the project a title");
      return;
    }
    setCreatingJob(true);

    const jobPayload: any = {
      title: jobForm.title,
      description: jobForm.description || null,
      priority: jobForm.priority,
      status: jobForm.isQuote ? "evaluation" : "pending",
      intake_type: jobForm.isQuote ? "quote" : "approved",
      client_id: jobDialogAppt.client_id,
    };
    if (jobForm.assigned_staff_id) jobPayload.assigned_staff_id = jobForm.assigned_staff_id;
    if (jobForm.due_date) jobPayload.due_date = jobForm.due_date;

    const { data: newJob, error: jobError } = await supabase.from("jobs").insert(jobPayload).select("id").single();
    if (jobError) { toast.error(jobError.message); setCreatingJob(false); return; }

    // Mark the appointment as confirmed so it's clear it has been processed
    await supabase.from("appointments").update({ status: "confirmed" }).eq("id", jobDialogAppt.id);

    setCreatingJob(false);
    setJobDialogAppt(null);
    fetchAppointments(page);
    toast.success(jobForm.isQuote ? "Quote created and appointment confirmed" : "Project created and appointment confirmed");
    navigate(`/projects/${newJob.id}`);
  };

  const handleExportCalendar = () => {
    const events = appointments.map(a => ({
      title: a.title,
      date: a.appointment_date,
      time: a.appointment_time?.slice(0, 5),
      durationMinutes: a.duration_minutes || 60,
      description: a.notes || undefined,
    }));
    downloadICS("appointments", generateICS(events, "Workshop Appointments"));
  };

  const filters: FilterOption[] = [
    { value: "upcoming", label: "Upcoming" },
    { value: "today", label: "Today" },
    { value: "past", label: "Past" },
    { value: "all", label: "All" },
  ];

  const statusPill = (a: any) => (
    <StatusPill tone={APPT_TONE[a.status] ?? "neutral"}>{APPT_LABEL[a.status] ?? a.status}</StatusPill>
  );

  const columns: Column<any>[] = [
    { key: "title", header: "Appointment", cell: (a) => a.title },
    { key: "client", header: "Client", cell: (a) => a.client_name, hideBelow: "md" },
    { key: "when", header: "When", cell: (a) => `${formatDate(a.appointment_date)} · ${(a.appointment_time || "").slice(0, 5)}` },
    { key: "type", header: "Type", cell: (a) => <span className="capitalize">{a.type}</span>, hideBelow: "lg" },
    { key: "status", header: "Status", cell: statusPill },
  ];

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Appointments"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${filters.find((f) => f.value === filter)?.label.toLowerCase()} ${totalCount === 1 ? "appointment" : "appointments"}`}
          actions={
            <>
              {appointments.length > 0 && (
                <Button variant="outline" onClick={handleExportCalendar}>
                  <Download />
                  <span className="hidden sm:inline">Export to calendar</span>
                  <span className="sr-only sm:hidden">Export to calendar</span>
                </Button>
              )}
              <Button onClick={() => { setEditItem(null); setForm({ ...emptyForm }); setOpen(true); }}>
                <Plus />
                New appointment
              </Button>
            </>
          }
        />

        <ListControls filters={filters} filter={filter} onFilterChange={(v) => { setFilter(v); reset(); }} />

        <DataList
          rows={appointments}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(a) => a.id}
          getRowHref={(a) => `/appointments/${a.id}`}
          mobile={{
            title: (a) => a.title,
            trailing: statusPill,
            meta: (a) => [`${formatDate(a.appointment_date)} · ${(a.appointment_time || "").slice(0, 5)}`, a.client_name !== "—" && a.client_name].filter(Boolean).join(" · "),
          }}
          actions={(a) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${a.title}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Mark as</DropdownMenuLabel>
                {APPT_STATUSES.filter((st) => st !== a.status).map((st) => (
                  <DropdownMenuItem key={st} className="min-h-[40px]" onClick={() => handleStatusChange(a.id, st)}>
                    {APPT_LABEL[st]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-[40px]" onClick={() => handleOpenCreateJob(a)}>
                  <Briefcase className="mr-2 h-4 w-4" />Create job from this
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-[40px]" onClick={() => handleOpenEdit(a)}>Edit</DropdownMenuItem>
                <DropdownMenuItem className="min-h-[40px] text-destructive focus:text-destructive" onClick={() => setDeleteId(a.id)}>Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          empty={
            filter === "upcoming" || filter === "today" ? (
              <EmptyState
                title={filter === "today" ? "Nothing booked today" : "No upcoming appointments"}
                description="Book a consultation, collection or delivery and it will show here."
                action={<Button onClick={() => { setEditItem(null); setForm({ ...emptyForm }); setOpen(true); }}><Plus />New appointment</Button>}
              />
            ) : (
              <EmptyState title="No appointments here" description="Try another filter." />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="appointments" />
      </div>

      {/* Create / Edit appointment dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditItem(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Appointment" : "New Appointment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="f-title">Title *</Label><Input id="f-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" /></div>
            <div>
              <Label htmlFor="f-client">Client *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger id="f-client" className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="f-date">Date *</Label><DatePickerInput id="f-date" value={form.appointment_date} onChange={(v) => setForm({ ...form, appointment_date: v })} className="mt-1" /></div>
              <div><Label htmlFor="f-time">Time *</Label><Input id="f-time" type="time" value={form.appointment_time} onChange={(e) => setForm({ ...form, appointment_time: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="f-type">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger id="f-type" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="f-duration-min">Duration (min)</Label><Input id="f-duration-min" type="number" min="15" step="15" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label htmlFor="f-notes">Notes</Label><Textarea id="f-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
            <Button onClick={handleSave} className="w-full">{editItem ? "Save Changes" : "Create Appointment"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Job from Appointment dialog */}
      <Dialog open={!!jobDialogAppt} onOpenChange={(v) => { if (!v) setJobDialogAppt(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a project from this appointment</DialogTitle>
            <DialogDescription>
              A work order will be created for <strong>{jobDialogAppt?.client_name}</strong> and the appointment will be marked as confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="f-job-title">Project title</Label>
              <Input id="f-job-title" value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="f-description">Description</Label>
              <Textarea id="f-description" value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} className="mt-1" rows={3} placeholder="Describe the work to be done..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="f-priority">Priority</Label>
                <Select value={jobForm.priority} onValueChange={(v) => setJobForm({ ...jobForm, priority: v })}>
                  <SelectTrigger id="f-priority" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-assign-staff">Assign Staff</Label>
                <Select value={jobForm.assigned_staff_id} onValueChange={(v) => setJobForm({ ...jobForm, assigned_staff_id: v })}>
                  <SelectTrigger id="f-assign-staff" className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="f-due-date">Due Date</Label>
              <DatePickerInput id="f-due-date" value={jobForm.due_date} onChange={(v) => setJobForm({ ...jobForm, due_date: v })} className="mt-1" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="jobIsQuote"
                checked={jobForm.isQuote}
                onCheckedChange={(v) => setJobForm({ ...jobForm, isQuote: !!v })}
              />
              <label htmlFor="jobIsQuote" className="text-sm cursor-pointer select-none">
                <span className="font-medium">Needs a quote first</span>
                <span className="text-muted-foreground ml-1">The client approves a quote before work starts.</span>
              </label>
            </div>
            <Button onClick={handleCreateJob} disabled={creatingJob} className="w-full">
              {jobForm.isQuote
                ? <><FileText className="mr-2 h-4 w-4" />{creatingJob ? "Creating..." : "Create Quote"}</>
                : <><Briefcase className="mr-2 h-4 w-4" />{creatingJob ? "Creating…" : "Create project"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Appointment?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
