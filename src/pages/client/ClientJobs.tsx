import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { PageBar } from "@/components/dashboard/PageBar";
import { JobStatusPill, StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import NewRequestDialog from "@/components/client/NewRequestDialog";
import ProjectName from "@/components/project/ProjectName";
import { formatDate } from "@/lib/format";
import { projectPath } from "@/lib/projects";

type Project = { id: string; ref: string | null; title: string; status: string; due_date: string | null; created_at: string };
type Request = {
  id: string;
  request_type: "quote" | "job";
  title: string;
  description: string | null;
  preferred_date: string | null;
  status: string;
  decline_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};
type WaitingQuote = { id: string; job_id: string; kind: string; title: string; subtotal: number };

const REQUEST_STATE: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Waiting for the workshop", tone: "info" },
  declined: { label: "Declined by the workshop", tone: "danger" },
};

// The stages a client recognises, not the workshop's internal steps.
const GROUPS: Record<string, string[]> = {
  open: ["received", "evaluation", "quote", "pending", "in_progress", "review"],
  ready: ["completed"],
  done: ["shipped"],
  cancelled: ["cancelled"],
};

/**
 * Everything the client has with the workshop in one place: requests not yet
 * received, quotes waiting for them, and every project. A request leaves this
 * list's top section once reception turns it into a project below.
 */
export default function ClientJobs() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [quotes, setQuotes] = useState<WaitingQuote[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const dialogOpen = params.get("new") === "request";
  const setDialogOpen = (open: boolean) =>
    setParams((p) => {
      if (open) p.set("new", "request");
      else p.delete("new");
      return p;
    });

  const load = useCallback(async () => {
    if (!user) return;
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const [j, r] = await Promise.all([
      supabase.from("jobs").select("id, ref, title, status, due_date, created_at").eq("client_id", user.id).order("created_at", { ascending: false }),
      supabase
        .from("client_requests")
        .select("id, request_type, title, description, preferred_date, status, decline_reason, created_at, reviewed_at")
        .eq("client_id", user.id)
        .or(`status.eq.pending,and(status.eq.declined,reviewed_at.gte.${monthAgo})`)
        .order("created_at", { ascending: false }),
    ]);
    const rows = (j.data ?? []) as Project[];
    setProjects(rows);
    setRequests((r.data ?? []) as Request[]);
    if (rows.length) {
      const { data: q } = await supabase
        .from("project_quotes")
        .select("id, job_id, kind, title, subtotal")
        .in("job_id", rows.map((p) => p.id))
        .eq("status", "sent");
      setQuotes(((q ?? []) as WaitingQuote[]).map((x) => ({ ...x, subtotal: Number(x.subtotal) })));
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel("client-projects-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `client_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const cancelRequest = async (r: Request) => {
    const { error } = await supabase.from("client_requests").update({ status: "cancelled" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(`Cancelled "${r.title}"`);
    void load();
  };

  const q = search.trim().toLowerCase();
  const shown = projects
    .filter((p) => filter === "all" || GROUPS[filter]?.includes(p.status))
    .filter((p) => !q || p.title.toLowerCase().includes(q) || (p.ref ?? "").toLowerCase().includes(q));
  const count = (group: string) => projects.filter((p) => GROUPS[group].includes(p.status)).length;
  const refOf = Object.fromEntries(projects.map((p) => [p.id, p.ref ?? p.title]));

  const columns: Column<Project>[] = [
    { key: "title", header: "Project", cell: (p) => <ProjectName refId={p.ref} title={p.title} /> },
    { key: "status", header: "Stage", cell: (p) => <JobStatusPill status={p.status} /> },
    { key: "due", header: "Due", cell: (p) => formatDate(p.due_date), hideBelow: "lg" },
    { key: "created", header: "Received", cell: (p) => formatDate(p.created_at), hideBelow: "md" },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-5xl space-y-4">
        <PageBar
          title="Projects"
          subtitle={isLoading ? "Loading…" : `${count("open")} in the workshop · ${count("ready")} ready · ${projects.length} in total`}
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden />
              New request
            </Button>
          }
        />

        {quotes.length > 0 && (
          <section aria-label="Quotes waiting for you" className="space-y-2 rounded-lg border border-warning/30 bg-warning-soft p-4">
            <h2 className="text-base font-semibold">{quotes.length === 1 ? "A quote is waiting for you" : `${quotes.length} quotes are waiting for you`}</h2>
            <ul className="space-y-2">
              {quotes.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{refOf[w.job_id]}</span> {w.kind === "change" ? "Change to the work" : "Quote"}
                    {w.title ? `: ${w.title}` : ""}
                  </span>
                  <Button asChild size="sm">
                    <Link to={projectPath(w.job_id)}>
                      <FileText className="mr-1.5 h-4 w-4" aria-hidden />
                      Review and decide
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {requests.length > 0 && (
          <section aria-label="Requests" className="rounded-lg border bg-card">
            <h2 className="border-b px-4 py-3 text-base font-semibold">Requests</h2>
            <ul className="divide-y">
              {requests.map((r) => {
                const state = REQUEST_STATE[r.status] ?? { label: r.status, tone: "neutral" as StatusTone };
                return (
                  <li key={r.id} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {r.request_type === "quote" ? "Quote request" : "Repair request"} · sent {formatDate(r.created_at)}
                          {r.preferred_date && ` · wanted by ${formatDate(r.preferred_date)}`}
                        </p>
                        <h3 className="text-sm font-semibold">{r.title}</h3>
                      </div>
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                    </div>
                    {r.status === "declined" && r.decline_reason && <p className="rounded-md bg-secondary px-3 py-2 text-sm">Workshop's reason: {r.decline_reason}</p>}
                    {r.status === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => void cancelRequest(r)}>
                        Cancel request
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <ListControls
          filters={[
            { value: "all", label: "All" },
            { value: "open", label: "In the workshop", count: count("open") },
            { value: "ready", label: "Ready", count: count("ready") },
            { value: "done", label: "Collected or delivered" },
            { value: "cancelled", label: "Cancelled" },
          ]}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by project ID or title"
        />

        <DataList
          rows={shown}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(p) => p.id}
          getRowHref={(p) => projectPath(p.id)}
          mobile={{
            title: (p) => <ProjectName refId={p.ref} title={p.title} />,
            trailing: (p) => <JobStatusPill status={p.status} />,
            meta: (p) => (p.due_date ? `Due ${formatDate(p.due_date)}` : `Received ${formatDate(p.created_at)}`),
          }}
          empty={
            filter !== "all" || q ? (
              <EmptyState title="No projects match" description="Try another filter or clear the search." />
            ) : (
              <EmptyState
                title="No projects yet"
                description="Send a request, or bring your machine in. Once the workshop receives it, its progress shows here."
                action={<Button onClick={() => setDialogOpen(true)}><Plus />New request</Button>}
              />
            )
          }
        />
      </div>
      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => void load()} />
    </DashboardLayout>
  );
}
