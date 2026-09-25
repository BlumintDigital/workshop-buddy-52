import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageBar } from "@/components/dashboard/PageBar";
import { JobStatusPill, PriorityLabel } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { formatDate } from "@/lib/format";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function ClientJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = async () => {
    setIsLoading(true);
    if (!user) { setIsLoading(false); return; }
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setJobs(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchJobs();

    const channel = supabase
      .channel("client-jobs-rt")
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "jobs",
        filter: `client_id=eq.${user.id}`,
      }, (payload) => {
        setJobs(prev => prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new } : j));
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "jobs",
        filter: `client_id=eq.${user.id}`,
      }, (payload) => {
        setJobs(prev => [payload.new as any, ...prev]);
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleQuoteAction = async (jobId: string, approve: boolean) => {
    const newStatus = approve ? "pending" : "cancelled";
    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", jobId);
    if (error) { toast.error(error.message); return; }
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
    toast.success(approve ? "Quote approved — work will begin shortly" : "Quote declined");
  };

  const quotes = jobs.filter(j => j.status === "quote");
  const q = search.trim().toLowerCase();
  const filtered = (filter === "all" ? jobs.filter((j) => j.status !== "quote") : jobs.filter((j) => j.status === filter)).filter(
    (j) => !q || j.title?.toLowerCase().includes(q),
  );
  const countOf = (status: string) => jobs.filter((j) => j.status === status).length;
  const active = jobs.filter((j) => j.status === "pending" || j.status === "in_progress" || j.status === "review").length;

  const columns: Column<any>[] = [
    { key: "title", header: "Job", cell: (job) => job.title },
    { key: "status", header: "Status", cell: (job) => <JobStatusPill status={job.status} /> },
    { key: "priority", header: "Priority", cell: (job) => <PriorityLabel priority={job.priority} />, hideBelow: "md" },
    { key: "due", header: "Due", cell: (job) => formatDate(job.due_date), hideBelow: "lg" },
    { key: "created", header: "Created", cell: (job) => formatDate(job.created_at) },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-5xl space-y-4">
        <PageBar
          title="Jobs"
          subtitle={isLoading ? "Loading…" : `${active} in progress · ${jobs.length} in total`}
          actions={
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "bg-success" : "bg-muted-foreground"}`} />
              {live ? "Live updates" : "Connecting…"}
            </span>
          }
        />

        {/* Quotes awaiting approval */}
        {quotes.length > 0 && (
          <Card className="border-warning/40 bg-warning-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quotes waiting for your approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quotes.map(q => (
                <div key={q.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Link to={`/jobs/${q.id}`} className="font-medium text-sm hover:underline">{q.title}</Link>
                    {q.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{q.description}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="min-h-[40px]" onClick={() => handleQuoteAction(q.id, false)}>
                      <XCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" aria-hidden />Decline
                    </Button>
                    <Button size="sm" className="min-h-[40px]" onClick={() => handleQuoteAction(q.id, true)}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />Approve
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <ListControls
          filters={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending", count: countOf("pending") },
            { value: "in_progress", label: "In progress", count: countOf("in_progress") },
            { value: "review", label: "Awaiting review", count: countOf("review") },
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
            meta: (job) => (job.due_date ? `Due ${formatDate(job.due_date)}` : `Created ${formatDate(job.created_at)}`),
          }}
          empty={
            filter !== "all" || q ? (
              <EmptyState title="No jobs match" description="Try another filter or clear the search." />
            ) : (
              <EmptyState title="No jobs yet" description="When the workshop starts work for you, the job and its progress show here." />
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
