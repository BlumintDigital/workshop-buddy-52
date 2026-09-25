import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { JobStatusPill, PriorityLabel } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { formatDate } from "@/lib/format";

export default function StaffJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState("mine");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = async () => {
    setIsLoading(true);
    if (!user) { setIsLoading(false); return; }
    const { data } = await supabase.from("jobs")
      .select("id, title, status, priority, due_date, assigned_staff_id, client_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setJobs(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchJobs();
  }, [user]);

  const mine = jobs.filter((j) => j.assigned_staff_id === user?.id);
  const q = search.trim().toLowerCase();
  const filtered = jobs
    .filter((j) => (filter === "mine" ? j.assigned_staff_id === user?.id : filter === "all" ? true : j.status === filter))
    .filter((j) => !q || j.title?.toLowerCase().includes(q));
  const openMine = mine.filter((j) => j.status !== "completed" && j.status !== "cancelled").length;

  const assignment = (job: any) => (job.assigned_staff_id === user?.id ? "You" : job.assigned_staff_id ? "Another technician" : "Unassigned");

  const columns: Column<any>[] = [
    { key: "title", header: "Job", cell: (job) => job.title },
    { key: "status", header: "Status", cell: (job) => <JobStatusPill status={job.status} /> },
    { key: "priority", header: "Priority", cell: (job) => <PriorityLabel priority={job.priority} />, hideBelow: "md" },
    { key: "assigned", header: "Assigned to", cell: assignment, hideBelow: "lg" },
    { key: "due", header: "Due", cell: (job) => formatDate(job.due_date) },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-5xl space-y-4">
        <PageBar
          title="Jobs"
          subtitle={isLoading ? "Loading…" : `${openMine} open and assigned to you · you can update only your own jobs`}
        />
        <ListControls
          filters={[
            { value: "mine", label: "Assigned to me", count: mine.length },
            { value: "all", label: "All jobs" },
            { value: "pending", label: "Pending" },
            { value: "in_progress", label: "In progress" },
            { value: "review", label: "Awaiting review" },
            { value: "completed", label: "Completed" },
          ]}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search jobs by title"
        />
        <DataList
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(job) => job.id}
          getRowHref={(job) => `/jobs/${job.id}`}
          mobile={{
            title: (job) => job.title,
            trailing: (job) => <JobStatusPill status={job.status} />,
            meta: (job) => [filter !== "mine" && assignment(job), job.due_date && `Due ${formatDate(job.due_date)}`].filter(Boolean).join(" · "),
          }}
          empty={
            filter === "mine" && !q ? (
              <EmptyState title="Nothing assigned to you" description="Jobs a manager assigns to you show here. Browse All jobs to see the whole workshop." />
            ) : (
              <EmptyState title="No jobs match" description="Try another filter or clear the search." />
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
