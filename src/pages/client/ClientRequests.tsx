import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/list/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import NewRequestDialog from "@/components/client/NewRequestDialog";
import { formatDate } from "@/lib/format";
import { projectPath } from "@/lib/projects";

type ClientRequest = {
  id: string;
  request_type: "quote" | "job";
  title: string;
  description: string | null;
  preferred_date: string | null;
  status: string;
  decline_reason: string | null;
  converted_job_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const STATE: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Waiting for the workshop", tone: "info" },
  converted: { label: "Received", tone: "success" },
  declined: { label: "Declined by the workshop", tone: "danger" },
  declined_by_client: { label: "You declined the quote", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * Requests the client sends from the portal. Reception receives each one and
 * turns it into a project; quotes, progress and messages then live on the
 * project page.
 */
export default function ClientRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("client_requests")
      .select("id, request_type, title, description, preferred_date, status, decline_reason, converted_job_id, created_at, reviewed_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Couldn't load your requests. Reload the page to try again.");
    const rows = (data ?? []) as ClientRequest[];
    const jobIds = rows.map((r) => r.converted_job_id).filter((v): v is string => !!v);
    if (jobIds.length) {
      const { data: jobs } = await supabase.from("jobs").select("id, ref").in("id", jobIds);
      setRefs(Object.fromEntries((jobs ?? []).map((j) => [j.id, j.ref])));
    }
    setRequests(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (r: ClientRequest) => {
    const { error } = await supabase.from("client_requests").update({ status: "cancelled" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(`Cancelled "${r.title}"`);
    void load();
  };

  const waiting = requests.filter((r) => r.status === "pending").length;

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-3xl space-y-4">
        <PageBar
          title="Requests"
          subtitle={loading ? "Loading…" : waiting ? `${waiting} waiting for the workshop` : "Ask for a quote or a repair. Quotes and progress appear on the project once the workshop receives it."}
          actions={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden />
              New request
            </Button>
          }
        />

        {loading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : requests.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-10 text-center">
            <EmptyState
              title="No requests yet"
              description="Tell the workshop what you need. They'll receive it, give it a project ID and send you a quote if you asked for one."
              action={<Button onClick={() => setDialogOpen(true)}><Plus />New request</Button>}
            />
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {requests.map((r) => {
              const state = STATE[r.status] ?? { label: r.status.replace(/_/g, " "), tone: "neutral" as StatusTone };
              const ref = r.converted_job_id ? refs[r.converted_job_id] : undefined;
              return (
                <li key={r.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {r.request_type === "quote" ? "Quote request" : "Repair request"} · sent {formatDate(r.created_at)}
                        {r.preferred_date && ` · wanted by ${formatDate(r.preferred_date)}`}
                      </p>
                      <h2 className="text-base font-semibold">{r.title}</h2>
                    </div>
                    <StatusPill tone={state.tone}>{state.label}</StatusPill>
                  </div>
                  {r.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{r.description}</p>}
                  {r.status === "declined" && r.decline_reason && <p className="rounded-md bg-secondary px-3 py-2 text-sm">Workshop's reason: {r.decline_reason}</p>}
                  <div className="flex flex-wrap gap-2">
                    {r.status === "converted" && r.converted_job_id && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={projectPath(r.converted_job_id)}>View project{ref ? ` ${ref}` : ""}</Link>
                      </Button>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => void cancel(r)}>
                        Cancel request
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={() => void load()} />
    </DashboardLayout>
  );
}
