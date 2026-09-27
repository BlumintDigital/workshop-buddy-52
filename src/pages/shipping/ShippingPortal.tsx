import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { EmptyState } from "@/components/list/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChoiceDialog, NotifyDialog, SHIPMENT_STATE, ShipDialog, type Shipment } from "@/components/shipping/ShipmentDialogs";
import { formatDate } from "@/lib/format";
import { projectPath } from "@/lib/projects";
import { billingState, fetchBillingStatus, type BillingStatus } from "@/lib/billing";

type Row = Shipment & { jobs: { id: string; ref: string; title: string; client_id: string | null; contact_name: string | null; contact_phone: string | null; updated_at: string } | null };

const TONE: Record<Shipment["status"], StatusTone> = { ready: "warning", awaiting_client: "info", scheduled: "info", shipped: "success" };
const TABS = [
  { value: "ready", label: "Ready", statuses: ["ready"] },
  { value: "waiting", label: "Waiting for client", statuses: ["awaiting_client"] },
  { value: "scheduled", label: "Arranged", statuses: ["scheduled"] },
  { value: "shipped", label: "Shipped", statuses: ["shipped"] },
];

/**
 * The shipping queue: projects that passed their quality check, from telling
 * the client through to collection or courier dispatch.
 */
export default function ShippingPortal() {
  const { has, loading: permLoading } = usePermissions();
  const { format: fmt } = useCurrency();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("ready");
  const [action, setAction] = useState<{ kind: "notify" | "choice" | "ship"; row: Row } | null>(null);
  const [billing, setBilling] = useState<Record<string, BillingStatus>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("shipments")
      .select("*, jobs(id, ref, title, client_id, contact_name, contact_phone, updated_at)")
      .order("created_at", { ascending: true })
      .limit(300);
    const loaded = (data ?? []) as unknown as Row[];
    setRows(loaded);
    // Payment status for everything still waiting to leave.
    setBilling(await fetchBillingStatus(loaded.filter((r) => r.status !== "shipped").map((r) => r.job_id)));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.value, rows.filter((r) => t.statuses.includes(r.status)).length])), [rows]);
  const statuses = TABS.find((t) => t.value === tab)?.statuses ?? [];
  const shown = rows.filter((r) => statuses.includes(r.status));
  if (tab === "shipped") shown.reverse();

  if (!permLoading && !has("shipping")) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl space-y-4">
          <PageBar title="Shipping" />
          <div className="rounded-lg border bg-card px-4 py-10 text-center">
            <EmptyState title="You don't have shipping access" description="Ask an admin to add you to the Shipping team in Teams and access." />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const done = () => {
    setAction(null);
    void load();
  };

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-5xl space-y-4">
        <PageBar title="Shipping" subtitle="Projects that passed their quality check, until they're collected or dispatched." />
        <ListControls filters={TABS.map((t) => ({ value: t.value, label: t.label, count: t.value === "shipped" ? undefined : counts[t.value] }))} filter={tab} onFilterChange={setTab} />
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : shown.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-10 text-center">
            <EmptyState title={tab === "shipped" ? "Nothing shipped yet" : "Nothing here"} description={tab === "ready" ? "Projects appear here as soon as they pass their quality check." : undefined} />
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((r) => {
              const job = r.jobs;
              if (!job) return null;
              const walkIn = !job.client_id;
              return (
                <li key={r.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <Link to={projectPath(job.id)} className="font-mono text-xs text-muted-foreground hover:underline">
                        {job.ref}
                      </Link>
                      <p className="text-sm font-semibold">{job.title}</p>
                      {walkIn && (job.contact_name || job.contact_phone) && (
                        <p className="text-sm">
                          Walk-in: {job.contact_name} <span className="select-all tabular-nums text-muted-foreground">{job.contact_phone}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {r.method ? (r.method === "pickup" ? "Collection" : "Courier delivery") : "Method not chosen"}
                        {r.preferred_date && ` · ${formatDate(r.preferred_date)}`}
                        {r.notified_at && ` · told ${formatDate(r.notified_at)}`}
                        {r.shipped_at && ` · shipped ${formatDate(r.shipped_at)}`}
                      </p>
                      {r.delivery_address && <p className="whitespace-pre-line text-sm text-muted-foreground">{r.delivery_address}</p>}
                      {r.client_notes && <p className="text-sm text-muted-foreground">"{r.client_notes}"</p>}
                      {r.status === "shipped" && (
                        <p className="text-sm">
                          {r.method === "pickup"
                            ? `Collected by ${r.collector_name}${r.vehicle_registration ? ` · ${r.vehicle_registration}` : ""}`
                            : `${r.carrier}${r.tracking_number ? ` · ${r.tracking_number}` : ""}${r.shipping_cost != null ? ` · ${fmt(Number(r.shipping_cost))}` : ""}`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusPill tone={TONE[r.status]}>{SHIPMENT_STATE[r.status]}</StatusPill>
                      {r.status !== "shipped" && (() => {
                        const pay = billingState(billing[r.job_id], walkIn);
                        return <StatusPill tone={pay.tone}>{pay.label}</StatusPill>;
                      })()}
                      {r.status !== "shipped" && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {(r.status === "ready" || r.status === "awaiting_client") && (
                            <Button size="sm" variant={r.status === "ready" ? "default" : "outline"} onClick={() => setAction({ kind: "notify", row: r })}>
                              {r.status === "ready" ? "Tell the client" : "Remind"}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setAction({ kind: "choice", row: r })}>
                            {r.method ? "Change arrangement" : "Record their choice"}
                          </Button>
                          <Button size="sm" variant={r.status === "scheduled" ? "default" : "outline"} onClick={() => setAction({ kind: "ship", row: r })}>
                            Hand over
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {action?.row.jobs && action.kind === "notify" && <NotifyDialog project={action.row.jobs} onClose={() => setAction(null)} onDone={done} />}
      {action?.row.jobs && action.kind === "choice" && <ChoiceDialog projectId={action.row.job_id} current={action.row} byStaff onClose={() => setAction(null)} onDone={done} />}
      {action?.row.jobs && action.kind === "ship" && <ShipDialog project={action.row.jobs} shipment={action.row} onClose={() => setAction(null)} onDone={done} />}
    </DashboardLayout>
  );
}
