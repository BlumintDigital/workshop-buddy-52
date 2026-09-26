import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import NotificationsPanel from "@/components/client/NotificationsPanel";
import { PageBar } from "@/components/dashboard/PageBar";
import { Panel } from "@/components/dashboard/Panel";
import { JobStatusPill, StatusPill } from "@/components/dashboard/StatusPill";
import { StepTracker } from "@/components/dashboard/StepTracker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { useFeature } from "@/hooks/useFeatureFlags";
import { todayIso } from "@/lib/dashboardQueries";

type Quote = {
  id: string;
  job_id: string;
  kind: "quote" | "change";
  number: number;
  title: string;
  subtotal: number;
  currency: string | null;
  valid_until: string | null;
  sent_at: string | null;
  jobs: { ref: string; title: string } | null;
};
type Order = { id: string; ref: string; title: string; status: string; due_date: string | null; updated_at: string };
type Invoice = {
  id: string;
  invoice_number: string | null;
  total: number;
  base_total: number | null;
  currency: string | null;
  status: string;
  due_date: string | null;
};
type Appointment = { id: string; title: string | null; appointment_date: string; appointment_time: string };

const ORDER_STEPS = ["Assessment", "Approved", "In progress", "Checks", "Ready"];
const ORDER_STEP: Record<string, number> = { received: 0, evaluation: 0, quote: 0, pending: 1, in_progress: 2, review: 3, completed: 4, shipped: 4 };

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Client home screen: decisions waiting on them first, then progress on their orders, then money owed. */
export default function ClientDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const { user, profile, refreshProfile } = useAuth();
  const { format } = useCurrency();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<Quote | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  // Evaluate the "finish your profile" prompt only on a fresh profile read, so
  // returning from /profile after saving never flashes a stale reminder.
  const [profileChecked, setProfileChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      await refreshProfile();
      if (!cancelled) setProfileChecked(true);
    };
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshProfile]);

  const missingDetails = useMemo(() => {
    if (!profileChecked || !profile) return [] as string[];
    const missing: string[] = [];
    if (!profile.company_name?.trim()) missing.push("company name");
    if (!profile.phone?.trim()) missing.push("phone number");
    if (!profile.address?.trim()) missing.push("address");
    return missing;
  }, [profile, profileChecked]);

  const load = useCallback(async () => {
    if (!user) return;
    const recent = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const [quotesRes, ordersRes, invoicesRes, apptsRes] = await Promise.all([
      supabase
        .from("project_quotes")
        .select("id, job_id, kind, number, title, subtotal, currency, valid_until, sent_at, jobs(ref, title)")
        .eq("status", "sent")
        .order("sent_at", { ascending: true }),
      supabase
        .from("jobs")
        .select("id, ref, title, status, due_date, updated_at")
        .eq("client_id", user.id)
        .or(`status.in.(received,evaluation,quote,pending,in_progress,review,completed),and(status.eq.shipped,updated_at.gte.${recent})`)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, base_total, currency, status, due_date")
        .eq("client_id", user.id)
        .in("status", ["sent", "overdue"])
        .order("due_date", { ascending: true }),
      appointmentsEnabled
        ? supabase
            .from("appointments")
            .select("id, title, appointment_date, appointment_time")
            .eq("client_id", user.id)
            .gte("appointment_date", todayIso())
            .order("appointment_date", { ascending: true })
            .order("appointment_time", { ascending: true })
            .limit(3)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    if (quotesRes.error || ordersRes.error || invoicesRes.error) {
      toast.error("Some of your information didn't load. Reload the page to try again.");
    }
    setQuotes((quotesRes.data || []) as Quote[]);
    setOrders((ordersRes.data || []) as Order[]);
    setInvoices((invoicesRes.data || []) as Invoice[]);
    setAppointments((apptsRes.data || []) as Appointment[]);
    setIsLoading(false);
  }, [user, appointmentsEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (quote: Quote, approve: boolean, reason?: string) => {
    if (deciding) return;
    setDeciding(quote.id);
    const { error } = await supabase.rpc("decide_project_quote", {
      _quote_id: quote.id,
      _accept: approve,
      _note: reason,
    });
    setDeciding(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(approve ? (quote.kind === "quote" ? "Quote accepted. The workshop will plan the work." : "Change accepted.") : "Declined. The workshop has been told.");
    setDeclineFor(null);
    setDeclineReason("");
    load();
  };

  // Sum in the workshop base currency so invoices in different currencies add up correctly.
  const owed = invoices.reduce((sum, i) => sum + (Number(i.base_total ?? i.total) || 0), 0);
  const today = todayIso();
  const hasAnything = quotes.length + orders.length + invoices.length + appointments.length > 0;
  const company = profile?.company_name?.trim();

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-2xl space-y-4">
        <PageBar
          title="Your orders"
          subtitle={company || undefined}
          actions={
            <Button asChild size="sm" className="h-10">
              <Link to="/client/requests">
                <Plus />
                New request
              </Link>
            </Button>
          }
        />

        {missingDetails.length > 0 && (
          <section className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-semibold">Finish setting up your profile.</span> Add your {missingDetails.join(", ")} so the workshop can reach you.
            </p>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/profile">Update profile</Link>
            </Button>
          </section>
        )}

        {isLoading ? (
          <>
            <Skeleton className="h-44 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </>
        ) : !hasAnything ? (
          <section className="rounded-lg border bg-card p-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-2 font-sans text-lg font-semibold">Nothing in progress</h2>
            <p className="mt-1 text-sm text-muted-foreground">Send the workshop a request and you'll see the quote, progress and invoices here.</p>
            <Button asChild className="mt-4">
              <Link to="/client/requests">Request a quote or repair</Link>
            </Button>
          </section>
        ) : (
          <>
            {quotes.map((q) => {
              const expired = !!q.valid_until && q.valid_until < today;
              const label = `${q.jobs?.ref ?? ""}-${q.kind === "quote" ? "Q" : "CR"}${q.number}`;
              return (
                <section key={q.id} aria-label={`${q.kind === "quote" ? "Quote" : "Change"}: ${q.jobs?.title ?? q.title}`} className="space-y-3 rounded-lg border border-warning/40 bg-card p-4">
                  <StatusPill tone="warning">{q.kind === "quote" ? "Quote ready: your decision" : "Change to approve"}</StatusPill>
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{label}</p>
                    <h2 className="font-sans text-lg font-semibold leading-snug">{q.title || q.jobs?.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {q.jobs?.title}
                      {q.sent_at && ` · sent ${shortDate(q.sent_at)}`}
                      {q.valid_until && ` · ${expired ? "expired" : "valid until"} ${shortDate(q.valid_until)}`}
                    </p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {format(Number(q.subtotal), q.currency || undefined)} <span className="text-sm font-normal text-muted-foreground">before tax</span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-12" disabled={!!deciding} onClick={() => setDeclineFor(q)}>
                      Decline
                    </Button>
                    <Button className="h-12" disabled={!!deciding} onClick={() => decide(q, true)}>
                      {deciding === q.id ? "Accepting…" : q.kind === "quote" ? "Accept quote" : "Accept change"}
                    </Button>
                  </div>
                  <Link to={`/projects/${q.job_id}`} className="inline-block text-sm font-medium text-primary hover:underline">
                    See the lines and details
                  </Link>
                </section>
              );
            })}

            {orders.length > 0 && (
              <Panel title="In progress" link={{ label: "All projects", to: "/client/projects" }}>
                <ul className="divide-y">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link to={`/projects/${o.id}`} className="block space-y-2.5 px-4 py-3.5 hover:bg-secondary/60">
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 text-sm font-semibold"><span className="block font-mono text-xs font-normal text-muted-foreground">{o.ref}</span>{o.title}</span>
                          <JobStatusPill status={o.status} />
                        </div>
                        <StepTracker steps={ORDER_STEPS} current={ORDER_STEP[o.status] ?? 0} />
                        {!["completed", "shipped"].includes(o.status) && o.due_date && (
                          <p className="text-xs text-muted-foreground">Expected by {shortDate(o.due_date)}</p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {invoices.length > 0 && (
              <Panel title={`To pay · ${format(owed)}`} link={{ label: "All invoices", to: "/client/invoices" }}>
                <ul className="divide-y">
                  {invoices.map((inv) => {
                    const overdue = inv.status === "overdue" || (!!inv.due_date && inv.due_date < today);
                    return (
                      <li key={inv.id}>
                        <Link to={`/invoices/${inv.id}`} className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/60">
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{inv.invoice_number || "Invoice"}</span>
                            <span className="text-xs text-muted-foreground">{inv.due_date ? `Due ${shortDate(inv.due_date)}` : "No due date"}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-sm font-semibold tabular-nums">{format(Number(inv.total), inv.currency || undefined)}</span>
                            <StatusPill tone={overdue ? "danger" : "info"}>{overdue ? "Overdue" : "To pay"}</StatusPill>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}

            {appointments.length > 0 && (
              <Panel title="Coming up" link={{ label: "All bookings", to: "/client/appointments" }}>
                <ul className="divide-y">
                  {appointments.map((a) => (
                    <li key={a.id}>
                      <Link to={`/appointments/${a.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-secondary/60">
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="text-sm tabular-nums">
                          {shortDate(a.appointment_date)} · {(a.appointment_time || "").slice(0, 5)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{a.title || "Appointment"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}

        {!isLoading && <NotificationsPanel />}
      </div>

      <AlertDialog open={!!declineFor} onOpenChange={(open) => !open && setDeclineFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              The workshop will be told you've declined "{declineFor?.title || declineFor?.jobs?.title}". Adding a reason helps them send a better option.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            id="decline-reason"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason (optional), e.g. price or timing"
            aria-label="Reason for declining"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep quote</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!!deciding}
              onClick={() => declineFor && decide(declineFor, false, declineReason.trim() || undefined)}
            >
              {deciding ? "Declining…" : "Decline quote"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
