import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MoreHorizontal, Briefcase, Download, FileText, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Checkbox } from "@/components/ui/checkbox";
import { generateICS, downloadICS } from "@/lib/ical";
import { toast } from "sonner";
import { sendEmail, appointmentConfirmedEmailHtml } from "@/lib/email";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline", confirmed: "secondary", in_progress: "default", completed: "default", cancelled: "destructive",
};

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

  const { page, setPage } = usePagination();

  const fetchAppointments = async (currentPage = page) => {
    const { data: appts, count } = await supabase
      .from("appointments")
      .select("*", { count: "exact" })
      .order("appointment_date", { ascending: true })
      .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    setTotalCount(count ?? 0);
    if (!appts) { setAppointments([]); return; }

    const clientIds = [...new Set(appts.map(a => a.client_id).filter(Boolean))];
    let clientMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", clientIds);
      if (profiles) profiles.forEach(p => { clientMap[p.id] = p.full_name || "Unknown"; });
    }
    setAppointments(appts.map(a => ({ ...a, client_name: clientMap[a.client_id] || "—" })));
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

  useEffect(() => { fetchAppointments(page); }, [page]);
  useEffect(() => { fetchUsers(); }, []);

  // Appointment save (create or update)
  const handleSave = async () => {
    if (!form.title || !form.client_id || !form.appointment_date || !form.appointment_time) {
      toast.error("Please fill in all required fields");
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
      toast.error("Job title is required");
      return;
    }
    setCreatingJob(true);

    const jobPayload: any = {
      title: jobForm.title,
      description: jobForm.description || null,
      priority: jobForm.priority,
      status: jobForm.isQuote ? "quote" : "pending",
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
    toast.success(jobForm.isQuote ? "Quote created — appointment marked as confirmed" : "Job created — appointment marked as confirmed");
    navigate(`/jobs/${newJob.id}`);
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Appointments</h2>
            <p className="text-muted-foreground">Manage all scheduled appointments</p>
          </div>
          <div className="flex gap-2">
            {appointments.length > 0 && (
              <Button variant="outline" onClick={handleExportCalendar}>
                <Download className="mr-2 h-4 w-4" />Export to Calendar
              </Button>
            )}
            <Button onClick={() => { setEditItem(null); setForm({ ...emptyForm }); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />New Appointment
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Time</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No appointments</TableCell></TableRow>
                ) : appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link to={`/appointments/${a.id}`} className="text-primary hover:underline">{a.title}</Link>
                    </TableCell>
                    <TableCell>{a.client_name}</TableCell>
                    <TableCell>{a.appointment_date}</TableCell>
                    <TableCell className="hidden sm:table-cell">{a.appointment_time}</TableCell>
                    <TableCell className="capitalize hidden md:table-cell">{a.type}</TableCell>
                    <TableCell>
                      <Select value={a.status} onValueChange={(v) => handleStatusChange(a.id, v)}>
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue>
                            <Badge variant={statusColors[a.status] || "outline"}>{a.status?.replace("_", " ")}</Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {APPT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/appointments/${a.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenCreateJob(a)}>
                            <Briefcase className="mr-2 h-4 w-4" />Create Job
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenEdit(a)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteId(a.id)} className="text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => setPage(p => Math.max(0, p - 1))} aria-disabled={page === 0} className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 py-1 text-sm">Page {page + 1} of {totalPages}</span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} aria-disabled={page >= totalPages - 1} className={page >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {/* Create / Edit appointment dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditItem(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Appointment" : "New Appointment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>Client *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date *</Label><DatePickerInput value={form.appointment_date} onChange={(v) => setForm({ ...form, appointment_date: v })} className="mt-1" /></div>
              <div><Label>Time *</Label><Input type="time" value={form.appointment_time} onChange={(e) => setForm({ ...form, appointment_time: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APPT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Duration (min)</Label><Input type="number" min="15" step="15" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
            <Button onClick={handleSave} className="w-full">{editItem ? "Save Changes" : "Create Appointment"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Job from Appointment dialog */}
      <Dialog open={!!jobDialogAppt} onOpenChange={(v) => { if (!v) setJobDialogAppt(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Job from Appointment</DialogTitle>
            <DialogDescription>
              A work order will be created for <strong>{jobDialogAppt?.client_name}</strong> and the appointment will be marked as confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Job Title</Label>
              <Input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} className="mt-1" rows={3} placeholder="Describe the work to be done..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Priority</Label>
                <Select value={jobForm.priority} onValueChange={(v) => setJobForm({ ...jobForm, priority: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assign Staff</Label>
                <Select value={jobForm.assigned_staff_id} onValueChange={(v) => setJobForm({ ...jobForm, assigned_staff_id: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due Date</Label>
              <DatePickerInput value={jobForm.due_date} onChange={(v) => setJobForm({ ...jobForm, due_date: v })} className="mt-1" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="jobIsQuote"
                checked={jobForm.isQuote}
                onCheckedChange={(v) => setJobForm({ ...jobForm, isQuote: !!v })}
              />
              <label htmlFor="jobIsQuote" className="text-sm cursor-pointer select-none">
                <span className="font-medium">Save as quote</span>
                <span className="text-muted-foreground ml-1">— client must approve before work begins</span>
              </label>
            </div>
            <Button onClick={handleCreateJob} disabled={creatingJob} className="w-full">
              {jobForm.isQuote
                ? <><FileText className="mr-2 h-4 w-4" />{creatingJob ? "Creating..." : "Create Quote"}</>
                : <><Briefcase className="mr-2 h-4 w-4" />{creatingJob ? "Creating..." : "Create Job"}</>}
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
