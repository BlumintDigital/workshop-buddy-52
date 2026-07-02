import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, Wrench, Inbox, CheckCircle2, XCircle } from "lucide-react";
import NewRequestDialog from "@/components/client/NewRequestDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";
import { requestStatusTone as statusTone, requestStatusLabelClient as statusLabel } from "@/lib/statusStyles";

type ClientRequest = {
  id: string;
  request_type: "quote" | "job";
  title: string;
  description: string | null;
  priority: string;
  preferred_date: string | null;
  status: "pending" | "quoted" | "approved" | "declined_by_client" | "declined" | "cancelled" | "converted";
  decline_reason: string | null;
  converted_job_id: string | null;
  quoted_total: number | null;
  quoted_currency: string | null;
  quoted_notes: string | null;
  quote_expires_at: string | null;
  client_decision_at: string | null;
  created_at: string;
};

type QuoteItem = { id: string; request_id: string; description: string; quantity: number; unit_price: number };


export default function ClientRequests() {
  const { user } = useAuth();
  const { format: fmt } = useCurrency();
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [items, setItems] = useState<Record<string, QuoteItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [declineFor, setDeclineFor] = useState<ClientRequest | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchRequests = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("client_requests")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data as any) || [];
    setRequests(rows);
    const quotedIds = rows.filter((r: any) => ["quoted", "approved", "declined_by_client"].includes(r.status)).map((r: any) => r.id);
    if (quotedIds.length) {
      const { data: it, error: itemsError } = await supabase
        .from("request_quote_items")
        .select("*")
        .in("request_id", quotedIds);
      if (itemsError) {
        toast.error("Couldn't load quote details. Please refresh.");
        setItems({});
      } else {
        const map: Record<string, QuoteItem[]> = {};
        ((it as any[]) || []).forEach((row: any) => {
          (map[row.request_id] ||= []).push(row as QuoteItem);
        });
        setItems(map);
      }
    } else {
      setItems({});
    }
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, [user]);

  const cancel = async (id: string) => {
    const { error } = await supabase.from("client_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Request cancelled"); fetchRequests(); }
  };

  const decide = async (r: ClientRequest, approve: boolean, reason?: string) => {
    // Guard against double-fires: ignore if already processing or the request is no longer in a decidable state.
    if (processing) return;
    if (r.status !== "quoted") {
      toast.info("This quote has already been responded to.");
      setDeclineFor(null);
      setDeclineReason("");
      return;
    }
    setProcessing(r.id);
    // Optimistically update local state so the buttons disappear immediately and can't be re-clicked.
    setRequests((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: approve ? "approved" : "declined_by_client", decline_reason: reason ?? null } : x)),
    );
    const { error } = await supabase.rpc("client_decide_quote", {
      _request_id: r.id,
      _approve: approve,
      _reason: reason ?? (null as any),
    });
    setProcessing(null);
    if (error) {
      toast.error(error.message);
      // Roll back optimistic update on failure.
      fetchRequests();
      return;
    }
    toast.success(approve ? "Quote approved — the workshop has been notified." : "Quote declined.");
    setDeclineFor(null);
    setDeclineReason("");
    fetchRequests();
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
            {requests.map((r) => {
              const quoteItems = items[r.id] || [];
              const isQuoted = r.status === "quoted";
              return (
                <Card key={r.id} tone="default">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {r.request_type === "quote" ? <FileText className="h-4 w-4 text-primary" /> : <Wrench className="h-4 w-4 text-primary" />}
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
                    </div>

                    {/* Quote details */}
                    {(r.status === "quoted" || r.status === "approved" || r.status === "declined_by_client") && quoteItems.length > 0 && (
                      <div className="rounded-xl border bg-tile-cream/40 p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quote details</p>
                        <ul className="space-y-1 text-sm">
                          {quoteItems.map((it) => (
                            <li key={it.id} className="flex items-baseline justify-between gap-3">
                              <span className="truncate">{it.description} <span className="text-muted-foreground">× {Number(it.quantity)}</span></span>
                              <span className="tabular-nums">{fmt(Number(it.quantity) * Number(it.unit_price), r.quoted_currency || undefined)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
                          <span className="font-medium">Total</span>
                          <span className="font-semibold tabular-nums">{fmt(Number(r.quoted_total || 0), r.quoted_currency || undefined)}</span>
                        </div>
                        {r.quote_expires_at && (
                          <p className="mt-1 text-xs text-muted-foreground">Valid until {new Date(r.quote_expires_at).toLocaleDateString()}</p>
                        )}
                        {r.quoted_notes && <p className="mt-2 whitespace-pre-wrap text-sm">{r.quoted_notes}</p>}

                        {isQuoted && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" disabled={!!processing} onClick={() => decide(r, true)}>
                              <CheckCircle2 className="h-4 w-4" /> {processing === r.id ? "Approving..." : "Approve quote"}
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!processing}
                              onClick={() => { setDeclineFor(r); setDeclineReason(""); }}>
                              <XCircle className="h-4 w-4" /> Decline quote
                            </Button>

                          </div>
                        )}
                      </div>
                    )}

                    {r.status === "approved" && (
                      <p className="rounded-md bg-tile-sage/40 px-3 py-2 text-xs">
                        Thanks — the workshop will convert this into a job and contact you with next steps.
                      </p>
                    )}

                    {(r.status === "declined" || r.status === "declined_by_client") && r.decline_reason && (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Reason: {r.decline_reason}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={fetchRequests} />

      <AlertDialog open={!!declineFor} onOpenChange={(v) => !v && setDeclineFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline quote</AlertDialogTitle>
            <AlertDialogDescription>
              Let the workshop know why you're declining (optional).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="e.g. Price is higher than expected."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => declineFor && decide(declineFor, false, declineReason.trim() || undefined)}>
              Decline quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
