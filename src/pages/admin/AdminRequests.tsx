import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Wrench, Inbox, CheckCircle2, XCircle, ExternalLink, FilePlus2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import QuoteBuilderDialog from "@/components/requests/QuoteBuilderDialog";
import { useCurrency } from "@/hooks/useCurrency";

type Req = {
  id: string;
  client_id: string;
  request_type: "quote" | "job";
  title: string;
  description: string | null;
  priority: string;
  preferred_date: string | null;
  status: string;
  decline_reason: string | null;
  converted_job_id: string | null;
  quoted_total: number | null;
  quoted_currency: string | null;
  quote_expires_at: string | null;
  client_decision_at: string | null;
  created_at: string;
};

type ClientInfo = { full_name: string | null; company_name: string | null };

const statusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  quoted: "bg-tile-sky text-foreground/80",
  approved: "bg-tile-sage text-foreground/80",
  declined_by_client: "bg-tile-blush text-foreground/80",
  converted: "bg-tile-sage text-foreground/80",
  declined: "bg-tile-blush text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  pending: "Pending review",
  quoted: "Quote sent — awaiting client",
  approved: "Client approved",
  declined_by_client: "Client declined quote",
  converted: "Converted to job",
  declined: "Declined",
  cancelled: "Cancelled",
};

export default function AdminRequests() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const { format: fmt } = useCurrency();
  const [requests, setRequests] = useState<Req[]>([]);
  const [clients, setClients] = useState<Record<string, ClientInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "quoted" | "approved" | "all">(focusId ? "all" : "pending");
  const [declineFor, setDeclineFor] = useState<Req | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const [quoteFor, setQuoteFor] = useState<Req | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});


  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data as any[]) || [];
    setRequests(rows);

    const ids = Array.from(new Set(rows.map((r) => r.client_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .in("id", ids);
      const map: Record<string, ClientInfo> = {};
      (profs || []).forEach((p: any) => {
        map[p.id] = { full_name: p.full_name, company_name: p.company_name };
      });
      setClients(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
    const channel = supabase
      .channel("admin-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_requests" }, fetchRequests)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Focus a specific request when arriving via ?focus=<id> (e.g. from JobDetail).
  useEffect(() => {
    if (!focusId || loading || requests.length === 0) return;
    const el = cardRefs.current[focusId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(focusId);
    const t = setTimeout(() => {
      setHighlightId(null);
      // Drop the query param so a refresh doesn't keep re-highlighting.
      searchParams.delete("focus");
      setSearchParams(searchParams, { replace: true });
    }, 2200);
    return () => clearTimeout(t);
  }, [focusId, loading, requests.length]);


  const accept = async (r: Req) => {
    setProcessing(r.id);
    const { data, error } = await supabase.rpc("accept_client_request", {
      _request_id: r.id,
    });
    setProcessing(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Request accepted and job created");
    if (data) navigate(`/jobs/${data}`);
    else fetchRequests();
  };

  const decline = async () => {
    if (!declineFor) return;
    if (!declineReason.trim()) { toast.error("Please give a reason"); return; }
    setProcessing(declineFor.id);
    const { error } = await supabase.rpc("decline_client_request", {
      _request_id: declineFor.id,
      _reason: declineReason.trim(),
    });
    setProcessing(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Request declined");
    setDeclineFor(null);
    setDeclineReason("");
    fetchRequests();
  };

  const filtered = requests.filter((r) => {
    if (tab === "pending") return r.status === "pending";
    if (tab === "quoted") return r.status === "quoted";
    if (tab === "approved") return r.status === "approved";
    return true;
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;

  const canConvert = (r: Req) =>
    (r.request_type === "job" && r.status === "pending") ||
    (r.request_type === "quote" && r.status === "approved");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-display text-3xl">Client Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review quote and job requests. Send a quote for client approval, or accept a job request directly.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="pending">
              Pending {pendingCount > 0 && <Badge className="ml-2" variant="secondary">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="quoted">Quoted</TabsTrigger>
            <TabsTrigger value="approved">
              Approved {approvedCount > 0 && <Badge className="ml-2" variant="secondary">{approvedCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card tone="cream">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Inbox className="h-10 w-10 text-primary/70" />
              <h3 className="text-display text-xl">Nothing here</h3>
              <p className="text-sm text-muted-foreground">No requests in this view.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const c = clients[r.client_id];
              const clientName = c?.company_name || c?.full_name || "Unknown client";
              const isQuote = r.request_type === "quote";
              return (
                <Card key={r.id} tone="default">
                  <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isQuote ? <FileText className="h-4 w-4 text-primary" /> : <Wrench className="h-4 w-4 text-primary" />}
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          {isQuote ? "Quote request" : "Job request"}
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", statusTone[r.status])}>
                          {statusLabel[r.status] || r.status}
                        </span>
                        <Badge variant="outline" className="capitalize">{r.priority}</Badge>
                      </div>
                      <p className="font-medium">{r.title}</p>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{clientName}</span>
                        {r.preferred_date && <span>Preferred: {new Date(r.preferred_date).toLocaleDateString()}</span>}
                        <span>Submitted {new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      {isQuote && r.quoted_total != null && (r.status === "quoted" || r.status === "approved" || r.status === "declined_by_client") && (
                        <div className="rounded-md border bg-tile-cream/40 px-3 py-2 text-xs">
                          Quote total: <span className="font-semibold">{fmt(Number(r.quoted_total), r.quoted_currency || undefined)}</span>
                          {r.quote_expires_at && <> · expires {new Date(r.quote_expires_at).toLocaleDateString()}</>}
                          {r.client_decision_at && r.status === "approved" && <> · approved {new Date(r.client_decision_at).toLocaleString()}</>}
                        </div>
                      )}
                      {r.decline_reason && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {r.status === "declined_by_client" ? "Client declined" : "Decline reason"}: {r.decline_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                      {r.converted_job_id && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/jobs/${r.converted_job_id}`}>
                            <ExternalLink className="h-4 w-4" /> View job
                          </Link>
                        </Button>
                      )}

                      {/* Quote-type: build & send / re-send quote */}
                      {isQuote && (r.status === "pending" || r.status === "quoted") && (
                        <Button size="sm" variant="outline" onClick={() => setQuoteFor(r)}>
                          <FilePlus2 className="h-4 w-4" />
                          {r.status === "quoted" ? "Revise quote" : "Build & send quote"}
                        </Button>
                      )}

                      {/* Convert to job: job-type pending OR quote-type approved */}
                      {canConvert(r) && (
                        <Button size="sm" disabled={processing === r.id} onClick={() => accept(r)}>
                          <CheckCircle2 className="h-4 w-4" />
                          {isQuote ? "Convert to job" : "Accept & create job"}
                        </Button>
                      )}

                      {/* Decline by workshop — only before client decision */}
                      {(r.status === "pending" || r.status === "quoted") && (
                        <Button
                          size="sm" variant="ghost"
                          disabled={processing === r.id}
                          onClick={() => { setDeclineFor(r); setDeclineReason(""); }}
                        >
                          <XCircle className="h-4 w-4" /> Decline
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!declineFor} onOpenChange={(v) => !v && setDeclineFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline request</AlertDialogTitle>
            <AlertDialogDescription>
              Share a short reason. The client will see this in their requests list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="e.g. We don't service this make of equipment."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={decline}>Decline request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QuoteBuilderDialog
        open={!!quoteFor}
        onOpenChange={(v) => !v && setQuoteFor(null)}
        requestId={quoteFor?.id || null}
        requestTitle={quoteFor?.title}
        onSubmitted={fetchRequests}
      />
    </DashboardLayout>
  );
}

