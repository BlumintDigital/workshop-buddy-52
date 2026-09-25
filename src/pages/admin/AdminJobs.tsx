import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FileText } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { PageBar } from "@/components/dashboard/PageBar";
import { JobStatusPill, PriorityLabel } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";


interface UserOption { id: string; full_name: string; }

export default function AdminJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    setIsLoading(true);
    let query = supabase.from("jobs").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (currentFilter !== "all") query = query.eq("status", currentFilter);
    if (currentSearch.trim()) query = query.ilike("title", `%${currentSearch.trim()}%`);
    query = query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, count } = await query;
    setTotalCount(count ?? 0);
    if (!data) { setJobs([]); setIsLoading(false); return; }

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
    setIsLoading(false);
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

  const filters: FilterOption[] = [
    { value: "all", label: "All" },
    { value: "quote", label: "Quotes" },
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In progress" },
    { value: "review", label: "Awaiting review" },
    { value: "completed", label: "Completed" },
  ];

  const columns: Column<any>[] = [
    {
      key: "title",
      header: "Job",
      cell: (job) => job.title,
    },
    { key: "status", header: "Status", cell: (job) => <JobStatusPill status={job.status} /> },
    { key: "priority", header: "Priority", cell: (job) => <PriorityLabel priority={job.priority} />, hideBelow: "md" },
    { key: "staff", header: "Assigned to", cell: (job) => job.staff_name, hideBelow: "lg" },
    { key: "client", header: "Client", cell: (job) => job.client_name, hideBelow: "md" },
    { key: "due", header: "Due", cell: (job) => formatDate(job.due_date), hideBelow: "lg" },
    { key: "created", header: "Created", cell: (job) => formatDate(job.created_at) },
  ];

  const hasQuery = filter !== "all" || debouncedSearch.trim() !== "";

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Jobs"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? "job" : "jobs"}${filter !== "all" ? ` · ${filters.find((f) => f.value === filter)?.label}` : ""}`}
          actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => fetchUsers()}><Plus />New job</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label htmlFor="f-title">Title</Label><Input id="f-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label htmlFor="f-description">Description</Label><Textarea id="f-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label htmlFor="f-priority">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger id="f-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="f-assign-staff">Assign Staff</Label>
                <Select value={form.assigned_staff_id} onValueChange={(v) => setForm({ ...form, assigned_staff_id: v })}>
                  <SelectTrigger id="f-assign-staff"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="f-assign-client">Assign Client</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger id="f-assign-client"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {clientUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-due-date">Due Date</Label>
                <DatePickerInput id="f-due-date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} className="mt-1" />
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
          }
        />

        <ListControls
          filters={filters}
          filter={filter}
          onFilterChange={handleFilterChange}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search jobs by title"
        />

        <DataList
          rows={jobs}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(job) => job.id}
          getRowHref={(job) => `/jobs/${job.id}`}
          mobile={{
            title: (job) => job.title,
            trailing: (job) => <JobStatusPill status={job.status} />,
            meta: (job) => [job.client_name !== "—" && job.client_name, job.staff_name !== "—" && `Assigned to ${job.staff_name}`, job.due_date && `Due ${formatDate(job.due_date)}`].filter(Boolean).join(" · "),
          }}
          empty={
            hasQuery ? (
              <EmptyState title="No jobs match" description="Try another filter or clear the search." />
            ) : (
              <EmptyState
                title="No jobs yet"
                description="Create a job, or convert an approved client request into one."
                action={<Button onClick={() => { fetchUsers(); setOpen(true); }}><Plus />New job</Button>}
              />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="jobs" />
      </div>
    </DashboardLayout>
  );
}


