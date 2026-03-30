import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  in_progress: "secondary",
  review: "default",
  completed: "default",
  cancelled: "destructive",
};

interface UserOption {
  id: string;
  full_name: string;
}

export default function AdminJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", status: "pending", assigned_staff_id: "", client_id: "" });
  const [staffUsers, setStaffUsers] = useState<UserOption[]>([]);
  const [clientUsers, setClientUsers] = useState<UserOption[]>([]);

  const fetchJobs = async () => {
    const { data } = await supabase.from("jobs").select("*").order("created_at", { ascending: false });
    if (!data) { setJobs([]); return; }

    // Collect unique user IDs for staff and clients
    const staffIds = [...new Set(data.filter(j => j.assigned_staff_id).map(j => j.assigned_staff_id!))];
    const clientIds = [...new Set(data.filter(j => j.client_id).map(j => j.client_id!))];
    const allIds = [...new Set([...staffIds, ...clientIds])];

    let profileMap: Record<string, string> = {};
    if (allIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", allIds);
      if (profiles) {
        profiles.forEach(p => { profileMap[p.id] = p.full_name || "Unknown"; });
      }
    }

    setJobs(data.map(j => ({
      ...j,
      staff_name: j.assigned_staff_id ? profileMap[j.assigned_staff_id] || "—" : "—",
      client_name: j.client_id ? profileMap[j.client_id] || "—" : "—",
    })));
  };

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (!roles) return;

    const staffRoles = roles.filter(r => r.role === "staff");
    const clientRoles = roles.filter(r => r.role === "client");
    const allIds = [...staffRoles, ...clientRoles].map(r => r.user_id);

    if (allIds.length === 0) return;

    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", allIds);
    if (!profiles) return;

    const profileMap = new Map(profiles.map(p => [p.id, p.full_name || "Unknown"]));

    setStaffUsers(staffRoles.map(r => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
    setClientUsers(clientRoles.map(r => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
  };

  useEffect(() => { fetchJobs(); fetchUsers(); }, []);

  const handleCreate = async () => {
    const payload: any = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      status: form.status,
    };
    if (form.assigned_staff_id) payload.assigned_staff_id = form.assigned_staff_id;
    if (form.client_id) payload.client_id = form.client_id;

    const { error } = await supabase.from("jobs").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Job created");
    setOpen(false);
    setForm({ title: "", description: "", priority: "medium", status: "pending", assigned_staff_id: "", client_id: "" });
    fetchJobs();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Jobs</h2>
            <p className="text-muted-foreground">Manage all workshop jobs</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Job</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Assign Staff</Label>
                  <Select value={form.assigned_staff_id} onValueChange={(v) => setForm({ ...form, assigned_staff_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {staffUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Assign Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {clientUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full">Create Job</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No jobs yet</TableCell></TableRow>
                ) : jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.title}</TableCell>
                    <TableCell><Badge variant={statusColors[job.status]}>{job.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="capitalize">{job.priority}</TableCell>
                    <TableCell>{job.staff_name}</TableCell>
                    <TableCell>{job.client_name}</TableCell>
                    <TableCell>{new Date(job.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
