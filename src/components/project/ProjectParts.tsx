import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { formatDate } from "@/lib/format";

type Movement = { item_id: string; type: string; quantity: number; inventory_items: { name: string; unit: string; unit_cost: number } | null };
type RequestLine = { id: string; description: string; quantity: number; quantity_issued: number; status: string };
type PartsRequest = { id: string; status: string; needed_by: string | null; created_at: string; stock_request_items: RequestLine[] };
type StockOption = { id: string; name: string; unit: string; quantity: number };

const LINE: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: "Waiting for stores", tone: "warning" },
  ordering: { label: "On order", tone: "info" },
  issued: { label: "Issued", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * Parts on this project: what's been issued (and its cost), and what's been
 * asked for. The team requests parts here; stores issues them from the
 * inventory portal.
 */
export default function ProjectParts({ project, isStores, onChanged }: { project: { id: string; ref: string }; isStores: boolean; onChanged?: () => void }) {
  const { format: fmt } = useCurrency();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [returning, setReturning] = useState<{ itemId: string; name: string; unit: string; max: number } | null>(null);

  const load = useCallback(async () => {
    const [m, r] = await Promise.all([
      supabase.from("inventory_transactions").select("item_id, type, quantity, inventory_items(name, unit, unit_cost)").eq("job_id", project.id).in("type", ["in", "out"]),
      supabase.from("stock_requests").select("id, status, needed_by, created_at, stock_request_items(id, description, quantity, quantity_issued, status)").eq("job_id", project.id).order("created_at", { ascending: false }),
    ]);
    setMovements((m.data ?? []) as unknown as Movement[]);
    setRequests((r.data ?? []) as unknown as PartsRequest[]);
  }, [project.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const used = useMemo(() => {
    const by = new Map<string, { itemId: string; name: string; unit: string; unitCost: number; qty: number }>();
    for (const m of movements) {
      const cur = by.get(m.item_id) ?? { itemId: m.item_id, name: m.inventory_items?.name ?? "Item", unit: m.inventory_items?.unit ?? "", unitCost: Number(m.inventory_items?.unit_cost ?? 0), qty: 0 };
      cur.qty += (m.type === "out" ? 1 : -1) * Number(m.quantity);
      by.set(m.item_id, cur);
    }
    return [...by.values()].filter((u) => u.qty > 0);
  }, [movements]);
  const total = used.reduce((s, u) => s + u.qty * u.unitCost, 0);
  const openRequests = requests.filter((r) => r.status === "open" || r.status === "partial");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5" aria-hidden />
            Parts
          </CardTitle>
          {used.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Parts cost so far: <span className="font-medium tabular-nums text-foreground">{fmt(total)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isStores && openRequests.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/inventory">Issue in inventory</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setRequesting(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            Request parts
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {used.length === 0 && requests.length === 0 && <p className="text-sm text-muted-foreground">No parts yet. Ask stores for what the job needs; they'll issue it and the cost is added here.</p>}

        {used.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Used</h3>
            <ul className="divide-y rounded-md border">
              {used.map((u) => (
                <li key={u.itemId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    {u.name} <span className="text-muted-foreground">× {u.qty} {u.unit}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="tabular-nums">{fmt(u.qty * u.unitCost)}</span>
                    {isStores && (
                      <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Take back unused ${u.name}`} title="Take back unused parts" onClick={() => setReturning({ itemId: u.itemId, name: u.name, unit: u.unit, max: u.qty })}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {requests.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested</h3>
            <ul className="space-y-2">
              {requests.slice(0, 6).map((r) => (
                <li key={r.id} className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Asked {formatDate(r.created_at)}
                    {r.needed_by && ` · needed by ${formatDate(r.needed_by)}`}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {r.stock_request_items.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {l.description} <span className="text-muted-foreground">× {l.quantity}</span>
                        </span>
                        <StatusPill tone={(LINE[l.status] ?? LINE.open).tone}>{(LINE[l.status] ?? LINE.open).label}</StatusPill>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {requesting && (
        <RequestDialog
          project={project}
          onClose={() => setRequesting(false)}
          onDone={() => {
            setRequesting(false);
            void load();
            onChanged?.();
          }}
        />
      )}
      {returning && (
        <ReturnDialog
          projectId={project.id}
          part={returning}
          onClose={() => setReturning(null)}
          onDone={() => {
            setReturning(null);
            void load();
          }}
        />
      )}
    </Card>
  );
}

type DraftLine = { item_id: string; description: string; quantity: string };
const OTHER = "__other__";

function RequestDialog({ project, onClose, onDone }: { project: { id: string; ref: string }; onClose: () => void; onDone: () => void }) {
  const [stock, setStock] = useState<StockOption[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([{ item_id: "", description: "", quantity: "1" }]);
  const [neededBy, setNeededBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase
      .from("inventory_items")
      .select("id, name, unit, quantity")
      .order("name")
      .then(({ data }) => setStock(((data ?? []) as StockOption[]).map((s) => ({ ...s, quantity: Number(s.quantity) }))));
  }, []);

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    const valid = lines.filter((l) => (l.item_id && l.item_id !== OTHER) || l.description.trim());
    if (valid.length === 0) return toast.error("Add at least one part");
    if (valid.some((l) => !(Number(l.quantity) > 0))) return toast.error("Each part needs a quantity");
    setSaving(true);
    const { error } = await supabase.rpc("request_parts", {
      _job_id: project.id,
      _items: valid.map((l) => ({ item_id: l.item_id && l.item_id !== OTHER ? l.item_id : "", description: l.description.trim(), quantity: Number(l.quantity) })),
      _notes: notes.trim() || undefined,
      _needed_by: neededBy || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Sent to stores. You'll be told when the parts are ready.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Request parts for {project.ref}</DialogTitle>
          <DialogDescription>Pick from stock, or describe a part stores doesn't keep. Stores issues or orders it.</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="sr-only">Parts</legend>
          {lines.map((l, i) => {
            const item = stock.find((s) => s.id === l.item_id);
            return (
              <div key={i} className="grid grid-cols-[1fr_5rem_2.5rem] items-start gap-2">
                <div className="space-y-2">
                  <Select value={l.item_id} onValueChange={(v) => setLine(i, { item_id: v })}>
                    <SelectTrigger aria-label={`Part ${i + 1}`}>
                      <SelectValue placeholder="Pick a part" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={OTHER}>Something not in stock…</SelectItem>
                      {stock.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.quantity} {s.unit} in stock)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {l.item_id === OTHER && (
                    <Input aria-label={`Part ${i + 1} description`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Describe the part (size, spec, make)" />
                  )}
                  {item && Number(l.quantity) > item.quantity && <p className="text-xs text-warning">Only {item.quantity} {item.unit} in stock; stores will order the rest.</p>}
                </div>
                <Input aria-label={`Part ${i + 1} quantity`} type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Button type="button" size="icon" variant="ghost" className="h-10 w-10" aria-label={`Remove part ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { item_id: "", description: "", quantity: "1" }])}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Add another part
          </Button>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-parts-needed">Needed by (optional)</Label>
            <DatePickerInput id="f-parts-needed" value={neededBy} onChange={setNeededBy} />
          </div>
          <div>
            <Label htmlFor="f-parts-notes">Note for stores (optional)</Label>
            <Textarea id="f-parts-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Sending…" : "Send to stores"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ projectId, part, onClose, onDone }: { projectId: string; part: { itemId: string; name: string; unit: string; max: number }; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(String(part.max));
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("return_parts", { _job_id: projectId, _item_id: part.itemId, _quantity: Number(qty) });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${qty} ${part.unit} ${part.name} back in stock`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Take back {part.name}</DialogTitle>
          <DialogDescription>Unused parts go back into stock and come off this project's cost.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-return-qty">How many came back</Label>
          <Input id="f-return-qty" type="number" min={0} max={part.max} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || !(Number(qty) > 0) || Number(qty) > part.max}>
            {saving ? "Saving…" : "Return to stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
