import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Plus, Search, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  quote: "secondary", pending: "outline", in_progress: "secondary", review: "default", completed: "default", cancelled: "destructive",
};

interface UserOption { id: string; full_name: string; }

export default function AdminJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assigned_staff_id: "", client_id: "", isQuote: false, due_date: "" });
  const [staffUsers, setStaffUsers] = useState<UserOption[]>([]);
  const [clientUsers, setClientUsers] = useState<UserOption[]>([]);
  const { page, setPage, from, reset } = usePagination();

  const fetchJobs = async (currentPage: number, currentFilter: string, currentSearch: string) => {
    let query = supabase.from("jobs").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (currentFilter !== "all") query = query.eq("status", currentFilter);
    if (currentSearch.trim()) query = query.ilike("title", `%${currentSearch.trim()}%`);
    query = query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, count } = await query;
    setTotalCount(count ?? 0);
    if (!data) { setJobs([]); return; }

    const staffIds = [...new Set(data.filter(j => j.assigned_staff_id).map(j => j.assigned_staff_id!))];
    const clientIds = [...new Set(data.filter(j => j.client_id).map(j => j.client_id!))];
    const allIds = [...new Set([...staffIds, ...clientIds])];
    let profileMap: Record<string, string> = {};
    if (allIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", allIds);
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p.full_name || "Unknown"; });
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

  // Debounce search — reset page then update debounced value (React 18 batches both setState calls)
  useEffect(() => {
    const timer = setTimeout(() => {
      reset();
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Re-fetch whenever page, filter, or debounced search changes
  useEffect(() => {
    fetchJobs(page, filter, debouncedSearch);
  }, [page, filter, debouncedSearch]);

  useEffect(() => { fetchUsers(); }, []);

  const handleFilterChange = (f: string) => {
    setFilter(f);
    setSearch("");
    setDebouncedSearch("");
    reset();
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const payload: any = { title: form.title, description: form.description, priority: form.priority, status: form.isQuote ? "quote" : "pending" };
    if (form.assigned_staff_id) payload.assigned_staff_id = form.assigned_staff_id;
    if (form.client_id) payload.client_id = form.client_id;
    if (form.due_date) payload.due_date = form.due_date;
    const { error } = await supabase.from("jobs").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Job created");
    setOpen(false);
    setForm({ title: "", description: "", priority: "medium", assigned_staff_id: "", client_id: "", isQuote: false, due_date: "" });
    fetchJobs(page, filter, debouncedSearch);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Jobs</h2>
            <p className="text-muted-foreground">Manage all workshop jobs</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => fetchUsers()}><Plus className="mr-2 h-4 w-4" />New Job</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                      {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Assign Client</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {clientUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="mt-1" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="isQuote"
                    checked={form.isQuote}
                    onCheckedChange={(v) => setForm({ ...form, isQuote: !!v })}
                  />
                  <label htmlFor="isQuote" className="text-sm cursor-pointer select-none">
                    <span className="font-medium">Save as quote</span>
                    <span className="text-muted-foreground ml-1">— client must approve before work begins</span>
                  </label>
                </div>
                <Button onClick={handleCreate} className="w-full">
                  {form.isQuote ? <><FileText className="mr-2 h-4 w-4" />Create Quote</> : "Create Job"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Tabs value={filter} onValueChange={handleFilterChange} className="flex-1">
            <TabsList className="flex overflow-x-auto flex-nowrap">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="quote">Quotes</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search all jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Priority</TableHead>
                  <TableHead className="hidden md:table-cell">Staff</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No jobs found</TableCell></TableRow>
                ) : jobs.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link to={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
                        {job.title}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant={statusColors[job.status]}>{job.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="capitalize hidden sm:table-cell">{job.priority}</TableCell>
                    <TableCell className="hidden md:table-cell">{job.staff_name}</TableCell>
                    <TableCell className="hidden md:table-cell">{job.client_name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{new Date(job.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {from + 1}–{Math.min(from + PAGE_SIZE, totalCount)} of {totalCount}</span>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    aria-disabled={page === 0}
                    className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 py-1 text-sm">Page {page + 1} of {totalPages}</span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    aria-disabled={page >= totalPages - 1}
                    className={page >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
