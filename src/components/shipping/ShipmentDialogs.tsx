import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { sendEmail, readyToShipEmailHtml } from "@/lib/email";
import { projectPath } from "@/lib/projects";
import { cn } from "@/lib/utils";

export type Shipment = {
  id: string;
  job_id: string;
  status: "ready" | "awaiting_client" | "scheduled" | "shipped";
  method: "pickup" | "courier" | null;
  preferred_date: string | null;
  delivery_address: string | null;
  client_notes: string | null;
  notified_at: string | null;
  collector_name: string | null;
  collector_id_number: string | null;
  collector_phone: string | null;
  vehicle_make: string | null;
  vehicle_registration: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipping_cost: number | null;
  currency: string | null;
  shipped_at: string | null;
};

export const SHIPMENT_STATE: Record<Shipment["status"], string> = {
  ready: "Ready, client not told yet",
  awaiting_client: "Waiting for the client's choice",
  scheduled: "Arranged",
  shipped: "Shipped",
};

type ProjectRef = { id: string; ref: string; title: string; client_id: string | null };

/** Tell the client (in the portal and by email) that their item is ready. */
export function NotifyDialog({ project, onClose, onDone }: { project: ProjectRef; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const send = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("notify_ready_to_ship", { _job_id: project.id, _message: message.trim() || undefined });
    setSaving(false);
    if (error) return toast.error(error.message);
    if (project.client_id) {
      sendEmail({
        to_user_id: project.client_id,
        subject: `Ready: ${project.ref} · ${project.title}`,
        html: readyToShipEmailHtml(`${project.ref} · ${project.title}`, `${window.location.origin}${projectPath(project.id)}`, message.trim() || undefined),
      }).catch(() => {});
    }
    toast.success(project.client_id ? "The client has been told it's ready" : "Marked as told. This is a walk-in customer, so call them.");
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tell the client {project.ref} is ready</DialogTitle>
          <DialogDescription>{project.client_id ? "They get a notification and an email asking whether they'll collect it or want it delivered." : "This customer has no portal account. Call them, then record their choice."}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-ready-message">Message (optional)</Label>
          <Textarea id="f-ready-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} placeholder="e.g. We're open 8 to 5, Monday to Friday. Bring photo ID." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={saving}>
            {saving ? "Sending…" : "Tell the client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Collection or delivery, chosen by the client or recorded by shipping for walk-ins. */
export function ChoiceDialog({ projectId, current, byStaff, onClose, onDone }: { projectId: string; current?: Shipment | null; byStaff?: boolean; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<"pickup" | "courier">(current?.method ?? "pickup");
  const [date, setDate] = useState(current?.preferred_date ?? "");
  const [address, setAddress] = useState(current?.delivery_address ?? "");
  const [notes, setNotes] = useState(current?.client_notes ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("choose_handover", {
      _job_id: projectId,
      _method: method,
      _preferred_date: date || undefined,
      _address: method === "courier" ? address : undefined,
      _notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(method === "pickup" ? "Collection arranged. The workshop has been told." : "Delivery requested. The workshop has been told.");
    onDone();
  };
  const options = [
    { value: "pickup" as const, label: "Collect it", description: "You or someone you send picks it up from the workshop." },
    { value: "courier" as const, label: "Deliver it", description: "The workshop sends it by courier to your address." },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{byStaff ? "Record the customer's choice" : "Collection or delivery"}</DialogTitle>
          <DialogDescription>{byStaff ? "For customers who told you in person or by phone." : "Tell the workshop how you'd like to get your item back."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label="How the item gets back" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={method === o.value}
                onClick={() => setMethod(o.value)}
                className={cn("rounded-lg border p-3 text-left", method === o.value ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-secondary")}
              >
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="f-handover-date">{method === "pickup" ? "When you'll collect (optional)" : "Wanted by (optional)"}</Label>
            <DatePickerInput id="f-handover-date" value={date} onChange={setDate} />
          </div>
          {method === "courier" && (
            <div>
              <Label htmlFor="f-handover-address">Delivery address</Label>
              <Textarea id="f-handover-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={500} />
            </div>
          )}
          <div>
            <Label htmlFor="f-handover-notes">{method === "pickup" ? "Who's collecting, or anything else (optional)" : "Delivery notes (optional)"}</Label>
            <Textarea id="f-handover-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Record the handover: who collected it (and the signed ticket), or the courier and tracking. */
export function ShipDialog({ project, shipment, onClose, onDone }: { project: ProjectRef; shipment: Shipment; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [method, setMethod] = useState<"pickup" | "courier">(shipment.method ?? "pickup");
  const [f, setF] = useState({ collector_name: "", collector_id_number: "", collector_phone: "", vehicle_make: "", vehicle_registration: "", carrier: "", tracking_number: "", tracking_url: "", shipping_cost: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (method === "courier" && f.tracking_url && !/^https?:\/\//i.test(f.tracking_url)) return toast.error("The tracking link must start with https://");
    setSaving(true);
    const { error } = await supabase.rpc("mark_shipped", { _job_id: project.id, _d: { method, ...f, currency } });
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    let failed = 0;
    for (const file of files) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "pdf";
      const path = `${project.id}/delivery/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (upErr) {
        failed++;
        continue;
      }
      const { error: rowErr } = await supabase.from("job_attachments").insert({
        job_id: project.id,
        uploaded_by: user!.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        kind: "delivery",
      });
      if (rowErr) failed++;
    }
    setSaving(false);
    toast.success(`${project.ref} ${method === "pickup" ? "collected" : "shipped"}${failed ? `. ${failed} document${failed > 1 ? "s" : ""} didn't upload; add them on the project page.` : ""}`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hand over {project.ref}</DialogTitle>
          <DialogDescription>{shipment.method ? `The client chose ${shipment.method === "pickup" ? "to collect it" : "courier delivery"}.` : "Record how the item left the workshop."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Handover" className="grid grid-cols-2 gap-2">
            {(["pickup", "courier"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={cn("rounded-lg border p-3 text-left text-sm font-semibold", method === m ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-secondary")}
              >
                {m === "pickup" ? "Collected" : "Sent by courier"}
              </button>
            ))}
          </div>
          {method === "pickup" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="f-ship-collector">Collected by</Label>
                <Input id="f-ship-collector" value={f.collector_name} onChange={(e) => set("collector_name", e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="f-ship-id">ID checked (optional)</Label>
                <Input id="f-ship-id" value={f.collector_id_number} onChange={(e) => set("collector_id_number", e.target.value)} placeholder="e.g. licence number" autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="f-ship-phone">Phone (optional)</Label>
                <Input id="f-ship-phone" type="tel" value={f.collector_phone} onChange={(e) => set("collector_phone", e.target.value)} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="f-ship-vehicle">Vehicle</Label>
                <Input id="f-ship-vehicle" value={f.vehicle_make} onChange={(e) => set("vehicle_make", e.target.value)} placeholder="e.g. White Ford Transit" />
              </div>
              <div>
                <Label htmlFor="f-ship-reg">Registration</Label>
                <Input id="f-ship-reg" value={f.vehicle_registration} onChange={(e) => set("vehicle_registration", e.target.value.toUpperCase())} className="font-mono" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="f-ship-carrier">Courier</Label>
                <Input id="f-ship-carrier" value={f.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="e.g. DPD" />
              </div>
              <div>
                <Label htmlFor="f-ship-tracking">Tracking number</Label>
                <Input id="f-ship-tracking" value={f.tracking_number} onChange={(e) => set("tracking_number", e.target.value)} className="font-mono" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="f-ship-url">Tracking link (optional)</Label>
                <Input id="f-ship-url" type="url" value={f.tracking_url} onChange={(e) => set("tracking_url", e.target.value)} placeholder="https://" />
              </div>
              <div>
                <Label htmlFor="f-ship-cost">Shipping cost ({currency})</Label>
                <Input id="f-ship-cost" type="number" min={0} step={0.01} value={f.shipping_cost} onChange={(e) => set("shipping_cost", e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden accept=".pdf,image/*" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Button type="button" variant="outline" onClick={() => input.current?.click()}>
              <Paperclip className="mr-1.5 h-4 w-4" aria-hidden />
              {files.length ? `${files.length} document${files.length > 1 ? "s" : ""} added` : method === "pickup" ? "Add the signed delivery ticket" : "Add the consignment note"}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">The client can see these documents on their project.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : method === "pickup" ? "Mark as collected" : "Mark as shipped"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
