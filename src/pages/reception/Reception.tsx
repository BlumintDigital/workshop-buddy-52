import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { JobStatusPill, StatusPill } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/list/EmptyState";
import IntakeForm, { clientLabel, type IntakePrefill, type ReceptionClient } from "@/components/project/IntakeForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { projectPath } from "@/lib/projects";

type Request = {
  id: string;
  client_id: string;
  request_type: "quote" | "job";
  title: string;
  description: string | null;
  priority: string;
  preferred_date: string | null;
  created_at: string;
};
type Recent = { id: string; ref: string; title: string; status: string; intake_type: string; received_at: string | null; contact_name: string | null; client_id: string | null };

/**
 * The front desk: log a machine as it arrives (it gets its permanent project
 * ID here), and turn requests clients sent from the portal into projects.
 */
export default function Reception() {
  const { has, loading: permLoading } = usePermissions();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "requests" ? "requests" : "log";
  const [clients, setClients] = useState<ReceptionClient[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefill, setPrefill] = useState<IntakePrefill | undefined>();
  const [formKey, setFormKey] = useState(0);
  const [declining, setDeclining] = useState<Request | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [c, r, j] = await Promise.all([
      supabase.rpc("reception_clients"),
      supabase.from("client_requests").select("id, client_id, request_type, title, description, priority, preferred_date, created_at").eq("status", "pending").order("created_at"),
      supabase.from("jobs").select("id, ref, title, status, intake_type, received_at, contact_name, client_id").gte("received_at", since).order("received_at", { ascending: false }).limit(10),
    ]);
    setClients((c.data ?? []) as ReceptionClient[]);
    setRequests((r.data ?? []) as Request[]);
    setRecent((j.data ?? []) as Recent[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from the calendar (?due=) or an appointment (?appointment=): start
  // the intake with what's already known.
  const fromAppointment = params.get("appointment");
  const dueFromCalendar = params.get("due");
  useEffect(() => {
    if (fromAppointment) {
      void supabase
        .from("appointments")
        .select("id, client_id, title, description, appointment_date, job_id")
        .eq("id", fromAppointment)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          if (data.job_id) {
            toast.info("This appointment is already linked to a project");
            return;
          }
          setPrefill({ appointmentId: data.id, clientId: data.client_id, title: data.title, description: data.description, intakeType: "evaluation" });
          setFormKey((k) => k + 1);
        });
    } else if (dueFromCalendar) {
      setPrefill({ dueDate: dueFromCalendar });
      setFormKey((k) => k + 1);
    }
  }, [fromAppointment, dueFromCalendar]);

  const clientName = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, clientLabel(c)])), [clients]);
  const setTab = (t: string) => setParams(t === "requests" ? { tab: "requests" } : {}, { replace: true });

  const receive = (r: Request) => {
    setPrefill({
      requestId: r.id,
      clientId: r.client_id,
      title: r.title,
      description: r.description,
      intakeType: r.request_type === "quote" ? "quote" : "approved",
      dueDate: r.preferred_date,
      priority: r.priority,
    });
    setFormKey((k) => k + 1);
    setTab("log");
  };

  if (!permLoading && !has("reception")) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl space-y-4">
          <PageBar title="Reception" />
          <div className="rounded-lg border bg-card px-4 py-10 text-center">
            <EmptyState title="You don't have reception access" description="Ask an admin to add you to the Reception team in Teams and access." />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-5xl space-y-4">
        <PageBar title="Reception" subtitle="Log machines as they arrive and handle requests from the client portal." />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="log" className="gap-1.5">
              <PackagePlus className="h-4 w-4" aria-hidden />
              Log a machine
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">
              <Inbox className="h-4 w-4" aria-hidden />
              Client requests
              {requests.length > 0 && <span className="tabular-nums text-muted-foreground">{requests.length}</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="log" className="mt-4">
            <div className="grid items-start gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{prefill?.requestId ? `Receive "${prefill.title}"` : "New project"}</CardTitle>
                  {prefill?.requestId && (
                    <p className="text-sm text-muted-foreground">
                      Filled in from the client's request. Check the details, add photos and log it.{" "}
                      <button type="button" className="text-primary underline" onClick={() => { setPrefill(undefined); setFormKey((k) => k + 1); }}>
                        Start a blank form
                      </button>
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-96 w-full" /> : <IntakeForm key={formKey} clients={clients} prefill={prefill} />}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Received this week</CardTitle>
                </CardHeader>
                <CardContent>
                  {recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing logged in the last 7 days.</p>
                  ) : (
                    <ul className="divide-y">
                      {recent.map((p) => (
                        <li key={p.id}>
                          <Link to={projectPath(p.id)} className="flex items-start justify-between gap-2 py-2.5 hover:underline">
                            <span className="min-w-0">
                              <span className="block font-mono text-xs text-muted-foreground">{p.ref}</span>
                              <span className="block truncate text-sm font-medium">{p.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {(p.client_id && clientName[p.client_id]) || p.contact_name || "No client"} · {p.received_at ? formatDate(p.received_at) : ""}
                              </span>
                            </span>
                            <JobStatusPill status={p.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : requests.length === 0 ? (
              <div className="rounded-lg border bg-card px-4 py-10 text-center">
                <EmptyState title="No requests waiting" description="Requests clients send from the portal appear here until you receive them." />
              </div>
            ) : (
              <ul className="space-y-3">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={r.request_type === "quote" ? "warning" : "info"}>{r.request_type === "quote" ? "Wants a quote" : "Wants a repair"}</StatusPill>
                          {r.priority === "urgent" && <StatusPill tone="danger">Urgent</StatusPill>}
                          {r.priority === "high" && <StatusPill tone="warning">High priority</StatusPill>}
                        </div>
                        <h2 className="text-base font-semibold">{r.title}</h2>
                        {r.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{r.description}</p>}
                        <p className="text-xs text-muted-foreground">
                          {clientName[r.client_id] ?? "Client"} · sent {formatDate(r.created_at)}
                          {r.preferred_date && ` · would like it by ${formatDate(r.preferred_date)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" onClick={() => setDeclining(r)}>
                          Decline
                        </Button>
                        <Button onClick={() => receive(r)}>Receive item</Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {declining && (
        <DeclineDialog
          request={declining}
          onClose={() => setDeclining(null)}
          onDone={() => {
            setDeclining(null);
            void load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

function DeclineDialog({ request, onClose, onDone }: { request: Request; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("decline_client_request", { _request_id: request.id, _reason: reason.trim() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Declined "${request.title}". The client has been told.`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Decline "{request.title}"?</DialogTitle>
          <DialogDescription>The client sees your reason in the portal and gets a notification.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-decline-reason">Reason</Label>
          <Textarea id="f-decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="e.g. We don't repair this type of machine" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep request
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={saving || !reason.trim()}>
            {saving ? "Declining…" : "Decline request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
