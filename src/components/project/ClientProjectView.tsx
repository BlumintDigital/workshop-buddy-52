import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JobStatusPill, StatusPill } from "@/components/dashboard/StatusPill";
import StageTracker from "@/components/project/StageTracker";
import ProjectFiles from "@/components/project/ProjectFiles";
import ProjectConversation from "@/components/project/ProjectConversation";
import ClientQuotes from "@/components/project/ClientQuotes";
import IntakeDetails, { type IntakeFields } from "@/components/project/IntakeDetails";
import { CLIENT_STAGES } from "@/lib/projects";
import { clientFriendlyInvoiceStatus } from "@/lib/invoiceStatus";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ClientProject extends IntakeFields {
  id: string;
  ref: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  client_id: string | null;
  assigned_staff_id: string | null;
}

/**
 * What a client sees for their project: where it is, the photos taken when it
 * arrived, files shared with them, quotes to decide on, messages and invoices.
 * Tasks, hours, parts and team notes stay inside the workshop.
 */
export default function ClientProjectView({ project, onStatusChange }: { project: ClientProject; onStatusChange: (status: string) => void }) {
  const { user } = useAuth();
  const { format: fmt } = useCurrency();
  const [stageDates, setStageDates] = useState<Record<string, string>>({});
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; status: string; total: number; currency: string; client_marked_paid_at: string | null }[]>([]);

  useEffect(() => {
    void (async () => {
      const [{ data: events }, { data: inv }] = await Promise.all([
        supabase.from("project_events").select("kind, data, created_at").eq("job_id", project.id).order("created_at"),
        supabase
          .from("invoices")
          .select("id, invoice_number, status, total, currency, client_marked_paid_at")
          .eq("job_id", project.id)
          .in("status", ["sent", "paid", "overdue"])
          .order("created_at"),
      ]);
      const dates: Record<string, string> = {};
      const mark = (status: string, at: string) => {
        const stage = CLIENT_STAGES.find((s) => s.statuses.includes(status));
        if (stage && !dates[stage.key]) dates[stage.key] = formatDate(at);
      };
      mark("received", project.created_at);
      (events ?? []).forEach((e) => {
        const to = (e.data as { to?: string } | null)?.to;
        if (e.kind === "status" && to) mark(to, e.created_at);
      });
      setStageDates(dates);
      setInvoices((inv ?? []) as typeof invoices);
    })();
  }, [project.id, project.created_at, project.status]);

  // Accepting a quote moves the project on; fetch the new stage for the tracker.
  const refreshStatus = async () => {
    const { data } = await supabase.from("jobs").select("status").eq("id", project.id).single();
    if (data) onStatusChange(data.status);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-primary-soft px-2 py-0.5 font-mono text-sm font-medium text-primary">{project.ref}</span>
          <JobStatusPill status={project.status} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        {project.description && <p className="max-w-prose whitespace-pre-line text-sm text-muted-foreground">{project.description}</p>}
        <p className="text-sm text-muted-foreground">
          Received {formatDate(project.created_at)}
          {project.due_date && ` · expected ${formatDate(project.due_date)}`}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StageTracker status={project.status} dates={stageDates} />
        </CardContent>
      </Card>

      <ClientQuotes project={project} onDecided={() => void refreshStatus()} />

      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <ProjectConversation project={project} />
          <IntakeDetails project={project} forClient />
        </div>
        <div className="space-y-6 lg:col-span-2">
          {invoices.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link to={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                        <span className="text-sm font-medium">{inv.invoice_number}</span>
                        <span className="flex items-center gap-2 text-sm tabular-nums">
                          {fmt(Number(inv.total), inv.currency)}
                          <StatusPill tone={inv.status === "paid" ? "success" : inv.status === "overdue" ? "danger" : "info"}>
                            {clientFriendlyInvoiceStatus(inv.status, inv.client_marked_paid_at)}
                          </StatusPill>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <ProjectFiles
            jobId={project.id}
            title="Condition on arrival"
            description="Photos the workshop took when your item was received."
            kinds={["intake"]}
            photos
            emptyText="No arrival photos yet."
          />
          <ProjectFiles
            jobId={project.id}
            title="Files"
            kinds={["shared", "client", "delivery"]}
            uploadKind="client"
            canDelete={(a) => a.kind === "client" && a.uploaded_by === user?.id}
            emptyText="Files the workshop shares with you, and anything you upload, appear here."
          />
          {(project.status === "completed" || project.status === "shipped") && <RateProject projectId={project.id} />}
        </div>
      </div>
    </div>
  );
}

function RateProject({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<{ rating: number; comment: string | null; created_at: string } | null>(null);
  const [value, setValue] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("job_ratings")
      .select("rating, comment, created_at")
      .eq("job_id", projectId)
      .eq("client_id", user.id)
      .maybeSingle()
      .then(({ data }) => setExisting(data));
  }, [projectId, user]);

  const submit = async () => {
    if (!user || value === 0) return;
    setSaving(true);
    const { error } = await supabase.from("job_ratings").insert({ job_id: projectId, client_id: user.id, rating: value, comment: comment.trim() || null });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setExisting({ rating: value, comment: comment.trim() || null, created_at: new Date().toISOString() });
    toast.success("Thanks for your feedback");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4" aria-hidden />
          Rate this project
        </CardTitle>
      </CardHeader>
      <CardContent>
        {existing ? (
          <div className="space-y-1">
            <p className="text-2xl text-warning" aria-label={`${existing.rating} out of 5`}>
              {"★".repeat(existing.rating)}
              <span className="text-muted-foreground">{"★".repeat(5 - existing.rating)}</span>
            </p>
            {existing.comment && <p className="text-sm text-muted-foreground">{existing.comment}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={value === s}
                  aria-label={`${s} star${s > 1 ? "s" : ""}`}
                  onClick={() => setValue(s)}
                  className={cn("h-10 w-10 rounded-md text-3xl leading-none", s <= value ? "text-warning" : "text-muted-foreground hover:text-warning")}
                >
                  ★
                </button>
              ))}
            </div>
            {value > 0 && (
              <>
                <Textarea aria-label="Your feedback (optional)" placeholder="Anything you'd like to tell us? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                <Button size="sm" disabled={saving} onClick={() => void submit()}>
                  {saving ? "Sending…" : "Send rating"}
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
