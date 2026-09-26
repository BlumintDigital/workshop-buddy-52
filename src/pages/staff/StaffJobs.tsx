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
import ProjectName from "@/components/project/ProjectName";

export default function StaffJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState("mine");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  // Projects where I have a task, and what my open tasks are called.
  const [myTaskJobs, setMyTaskJobs] = useState<Record<string, string[]>>({});

  const fetchJobs = async () => {
    setIsLoading(true);
    if (!user) { setIsLoading(false); return; }
    const [{ data }, { data: tasks }] = await Promise.all([
      supabase.from("jobs")
        .select("id, ref, title, status, priority, due_date, assigned_staff_id, client_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("job_tasks").select("job_id, title, status").eq("assigned_to", user.id),
    ]);
    const byJob: Record<string, string[]> = {};
    (tasks ?? []).forEach((t) => {
      byJob[t.job_id] = byJob[t.job_id] ?? [];
      if (t.status !== "completed") byJob[t.job_id].push(t.title);
    });
    setMyTaskJobs(byJob);
    setJobs(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchJobs();
  }, [user]);

  const isMine = (j: any) => j.assigned_staff_id === user?.id || j.id in myTaskJobs;
  const mine = jobs.filter(isMine);
  const q = search.trim().toLowerCase();
  const filtered = jobs
    .filter((j) => (filter === "mine" ? isMine(j) : filter === "all" ? true : j.status === filter))
    .filter((j) => !q || j.title?.toLowerCase().includes(q) || j.ref?.toLowerCase().includes(q));
  const openMine = mine.filter((j) => j.status !== "completed" && j.status !== "cancelled").length;

  const assignment = (job: any) => {
    const open = myTaskJobs[job.id] ?? [];
    if (open.length) return open.length === 1 ? `Your task: ${open[0]}` : `${open.length} tasks for you`;
    if (job.assigned_staff_id === user?.id) return "You lead it";
    return job.id in myTaskJobs ? "Your tasks are done" : "Your team";
  };

  const columns: Column<any>[] = [
    { key: "title", header: "Project", cell: (job) => <ProjectName refId={job.ref} title={job.title} /> },
    { key: "status", header: "Status", cell: (job) => <JobStatusPill status={job.status} /> },
    { key: "priority", header: "Priority", cell: (job) => <PriorityLabel priority={job.priority} />, hideBelow: "md" },
    { key: "assigned", header: "Your part", cell: assignment, hideBelow: "lg" },
    { key: "due", header: "Due", cell: (job) => formatDate(job.due_date) },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-5xl space-y-4">
        <PageBar
          title="Projects"
          subtitle={isLoading ? "Loading…" : `${openMine} open projects with work for you`}
        />
        <ListControls
          filters={[
            { value: "mine", label: "Assigned to me", count: mine.length },
            { value: "all", label: "All projects" },
            { value: "pending", label: "Pending" },
            { value: "in_progress", label: "In progress" },
            { value: "review", label: "Awaiting review" },
            { value: "completed", label: "Completed" },
          ]}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by project ID or title"
        />
        <DataList
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(job) => job.id}
          getRowHref={(job) => `/projects/${job.id}`}
          mobile={{
            title: (job) => <ProjectName refId={job.ref} title={job.title} />,
            trailing: (job) => <JobStatusPill status={job.status} />,
            meta: (job) => [filter !== "mine" && assignment(job), job.due_date && `Due ${formatDate(job.due_date)}`].filter(Boolean).join(" · "),
          }}
          empty={
            filter === "mine" && !q ? (
              <EmptyState title="Nothing assigned to you" description="Projects a manager assigns to you show here. Browse All projects to see the whole workshop." />
            ) : (
              <EmptyState title="No projects match" description="Try another filter or clear the search." />
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
