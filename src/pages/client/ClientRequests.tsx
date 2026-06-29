import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileText, Wrench, Inbox } from "lucide-react";
import NewRequestDialog from "@/components/client/NewRequestDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ClientRequest = {
  id: string;
  request_type: "quote" | "job";
  title: string;
  description: string | null;
  priority: string;
  preferred_date: string | null;
  status: "pending" | "quoted" | "accepted" | "declined" | "cancelled" | "converted";
  decline_reason: string | null;
  converted_job_id: string | null;
  created_at: string;
};

const statusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  quoted: "bg-tile-sky text-foreground/80",
  accepted: "bg-tile-sage text-foreground/80",
  converted: "bg-tile-sage text-foreground/80",
  declined: "bg-tile-blush text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  pending: "Awaiting review",
  quoted: "Quote sent",
  accepted: "Accepted",
  converted: "Converted to job",
  declined: "Declined",
  cancelled: "Cancelled",
};

export default function ClientRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchRequests = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("client_requests")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRequests((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, [user]);

  const cancel = async (id: string) => {
    const { error } = await supabase
      .from("client_requests")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Request cancelled"); fetchRequests(); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-display text-3xl">My Requests</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit a quote or job request and track responses from the workshop.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} variant="glow">
            <Plus className="h-4 w-4" /> New request
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        ) : requests.length === 0 ? (
          <Card tone="cream">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Inbox className="h-10 w-10 text-primary/70" />
              <h3 className="text-display text-xl">No requests yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Start by asking for a quote or requesting work to be done. The workshop will review and respond.
              </p>
              <Button onClick={() => setDialogOpen(true)} variant="glow" className="mt-2">
                <Plus className="h-4 w-4" /> New request
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <Card key={r.id} tone="default">
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {r.request_type === "quote" ? (
                        <FileText className="h-4 w-4 text-primary" />
                      ) : (
                        <Wrench className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        {r.request_type === "quote" ? "Quote request" : "Job request"}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", statusTone[r.status])}>
                        {statusLabel[r.status]}
                      </span>
                    </div>
                    <p className="mt-1 font-medium">{r.title}</p>
                    {r.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{r.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="capitalize">{r.priority}</Badge>
                      {r.preferred_date && <span>Preferred: {new Date(r.preferred_date).toLocaleDateString()}</span>}
                      <span>·</span>
                      <span>Submitted {new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.status === "declined" && r.decline_reason && (
                      <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Reason: {r.decline_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {r.converted_job_id && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/jobs/${r.converted_job_id}`}>View job</Link>
                      </Button>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={fetchRequests} />
    </DashboardLayout>
  );
}
