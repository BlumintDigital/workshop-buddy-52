import { useCallback, useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ChoiceDialog, NotifyDialog, SHIPMENT_STATE, ShipDialog, type Shipment } from "@/components/shipping/ShipmentDialogs";
import { formatDate } from "@/lib/format";

type Project = { id: string; ref: string; title: string; client_id: string | null; status: string };

/**
 * Collection or delivery for a finished project. Clients choose how they get
 * it back; shipping records the handover. Shows nothing until the project
 * has passed its quality check.
 */
export default function ShipmentPanel({ project, forClient, canShip, onChanged }: { project: Project; forClient?: boolean; canShip?: boolean; onChanged?: () => void }) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [dialog, setDialog] = useState<"notify" | "choice" | "ship" | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("shipments").select("*").eq("job_id", project.id).maybeSingle();
    setShipment(data as Shipment | null);
  }, [project.id]);
  useEffect(() => {
    void load();
  }, [load, project.status]);

  if (!shipment) return null;
  const done = () => {
    setDialog(null);
    void load();
    onChanged?.();
  };
  const s = shipment;

  const details = (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {s.method && (
        <div>
          <dt className="text-xs text-muted-foreground">How</dt>
          <dd>{s.method === "pickup" ? "Collection from the workshop" : "Courier delivery"}</dd>
        </div>
      )}
      {s.preferred_date && (
        <div>
          <dt className="text-xs text-muted-foreground">{s.method === "pickup" ? "Collecting" : "Wanted by"}</dt>
          <dd>{formatDate(s.preferred_date)}</dd>
        </div>
      )}
      {s.delivery_address && (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Delivery address</dt>
          <dd className="whitespace-pre-line">{s.delivery_address}</dd>
        </div>
      )}
      {s.status === "shipped" && s.method === "pickup" && (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Collected</dt>
          <dd>
            {s.collector_name}
            {s.vehicle_registration && ` · ${[s.vehicle_make, s.vehicle_registration].filter(Boolean).join(" ")}`}
            {s.shipped_at && ` · ${formatDate(s.shipped_at)}`}
          </dd>
        </div>
      )}
      {s.status === "shipped" && s.method === "courier" && (
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Shipped</dt>
          <dd>
            {s.carrier}
            {s.tracking_number && <span className="select-all font-mono"> · {s.tracking_number}</span>}
            {s.shipped_at && ` · ${formatDate(s.shipped_at)}`}
            {s.tracking_url && (
              <>
                {" · "}
                <a href={s.tracking_url} target="_blank" rel="noreferrer" className="text-primary underline">
                  Track it
                </a>
              </>
            )}
          </dd>
        </div>
      )}
    </dl>
  );

  if (forClient) {
    const canChoose = s.status === "awaiting_client" || s.status === "scheduled";
    return (
      <Card className={s.status === "awaiting_client" ? "border-warning/40" : undefined}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5" aria-hidden />
            {s.status === "shipped" ? (s.method === "pickup" ? "Collected" : "On its way") : s.status === "awaiting_client" ? "Your item is ready" : s.status === "scheduled" ? "Collection or delivery arranged" : "Getting ready for you"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.status === "ready" && <p className="text-sm text-muted-foreground">It passed its final checks. The workshop will tell you when it's ready to go.</p>}
          {s.status === "awaiting_client" && <p className="text-sm">Tell the workshop whether you'll collect it or want it delivered.</p>}
          {details}
          {canChoose && (
            <Button onClick={() => setDialog("choice")} variant={s.status === "awaiting_client" ? "default" : "outline"}>
              {s.status === "awaiting_client" ? "Choose collection or delivery" : "Change the arrangement"}
            </Button>
          )}
        </CardContent>
        {dialog === "choice" && <ChoiceDialog projectId={project.id} current={s} onClose={() => setDialog(null)} onDone={done} />}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4" aria-hidden />
          Shipping
        </CardTitle>
        <StatusPill tone={s.status === "shipped" ? "success" : s.status === "ready" ? "warning" : "info"}>{SHIPMENT_STATE[s.status]}</StatusPill>
      </CardHeader>
      <CardContent className="space-y-3">
        {details}
        {s.client_notes && <p className="text-sm text-muted-foreground">Client's note: "{s.client_notes}"</p>}
        {canShip && s.status !== "shipped" && (
          <div className="flex flex-wrap gap-2">
            {(s.status === "ready" || s.status === "awaiting_client") && (
              <Button size="sm" variant={s.status === "ready" ? "default" : "outline"} onClick={() => setDialog("notify")}>
                {s.status === "ready" ? "Tell the client" : "Remind the client"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setDialog("choice")}>
              {s.method ? "Change arrangement" : "Record their choice"}
            </Button>
            <Button size="sm" variant={s.status === "scheduled" ? "default" : "outline"} onClick={() => setDialog("ship")}>
              Hand over
            </Button>
          </div>
        )}
      </CardContent>
      {dialog === "notify" && <NotifyDialog project={project} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "choice" && <ChoiceDialog projectId={project.id} current={s} byStaff onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "ship" && <ShipDialog project={project} shipment={s} onClose={() => setDialog(null)} onDone={done} />}
    </Card>
  );
}
