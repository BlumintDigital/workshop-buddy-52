import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { formatDate } from "@/lib/format";
import { projectSearchFilter } from "@/lib/projects";
import ProjectName from "@/components/project/ProjectName";
import { Button } from "@/components/ui/button";
import { PackagePlus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { PageBar } from "@/components/dashboard/PageBar";
import { JobStatusPill, PriorityLabel } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";

// Filters by lifecycle stage. "Evaluating" also covers projects still being routed.
const STAGE_FILTERS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "evaluation", label: "Evaluating" },
  { value: "quote", label: "Quote sent" },
  { value: "pending", label: "Approved" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Quality check" },
  { value: "completed", label: "Ready to ship" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [params, setParams] = useSearchParams();
  const initial = params.get("status");
  const [filter, setFilter] = useState(initial && STAGE_FILTERS.some((f) => f.value === initial) ? initial : "all");
  const { has } = usePermissions();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { page, setPage, reset } = usePagination();

  const fetchJobs = async (currentPage: number, currentFilter: string, currentSearch: string) => {
    setIsLoading(true);
    let query = supabase.from("jobs").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (currentFilter === "evaluation") query = query.in("status", ["received", "evaluation"]);
    else if (currentFilter !== "all") query = query.eq("status", currentFilter);
    const search = projectSearchFilter(currentSearch);
    if (search) query = query.or(search);
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

  const handleFilterChange = (f: string) => {
    setFilter(f);
    setParams(f === "all" ? {} : { status: f }, { replace: true });
    setSearch("");
    setDebouncedSearch("");
    reset();
  };

  const filters = STAGE_FILTERS;

  const columns: Column<any>[] = [
    {
      key: "title",
      header: "Project",
      cell: (job) => <ProjectName refId={job.ref} title={job.title} />,
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
          title="Projects"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? "project" : "projects"}${filter !== "all" ? ` · ${filters.find((f) => f.value === filter)?.label}` : ""}`}
          actions={
            has("reception") ? (
              <Button asChild>
                <Link to="/reception">
                  <PackagePlus aria-hidden />
                  Log a machine
                </Link>
              </Button>
            ) : undefined
          }
        />

        <ListControls
          filters={filters}
          filter={filter}
          onFilterChange={handleFilterChange}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by project ID or title"
        />

        <DataList
          rows={jobs}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(job) => job.id}
          getRowHref={(job) => `/projects/${job.id}`}
          mobile={{
            title: (job) => <ProjectName refId={job.ref} title={job.title} />,
            trailing: (job) => <JobStatusPill status={job.status} />,
            meta: (job) => [job.client_name !== "—" && job.client_name, job.staff_name !== "—" && `Assigned to ${job.staff_name}`, job.due_date && `Due ${formatDate(job.due_date)}`].filter(Boolean).join(" · "),
          }}
          empty={
            hasQuery ? (
              <EmptyState title="No projects match" description="Try another filter or clear the search." />
            ) : (
              <EmptyState
                title="No projects yet"
                description="Projects start at reception, when a machine comes in or a client request is received."
                action={has("reception") ? <Button asChild><Link to="/reception"><PackagePlus aria-hidden />Log a machine</Link></Button> : undefined}
              />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="projects" />
      </div>
    </DashboardLayout>
  );
}


