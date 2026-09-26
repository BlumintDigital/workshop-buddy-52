import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { EmptyState } from "@/components/list/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { formatDate } from "@/lib/format";
import type { StockItem, Supplier } from "@/components/inventory/StockSection";

type POLine = { id?: string; item_id: string | null; request_item_id?: string | null; description: string; quantity: number; unit_cost: number; quantity_received: number; position: number };
type PO = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  job_id: string | null;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "ordered" | "received" | "cancelled";
  currency: string | null;
  subtotal: number;
  quote_file_path: string | null;
  quote_file_name: string | null;
  notes: string | null;
  expected_at: string | null;
  decision_note: string | null;
  created_at: string;
  jobs: { ref: string } | null;
  purchase_order_items: POLine[];
};

const PO_STATE: Record<PO["status"], { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for approval", tone: "warning" },
  approved: { label: "Approved, not ordered", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
  ordered: { label: "On order", tone: "info" },
  received: { label: "Received", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const FILTERS = [
  { value: "active", label: "Open", statuses: ["draft", "pending_approval", "approved", "ordered"] },
  { value: "approval", label: "To approve", statuses: ["pending_approval"] },
  { value: "done", label: "Closed", statuses: ["received", "rejected", "cancelled"] },
];

export default function PurchasesSection({ canManage, canApprove, suppliers }: { canManage: boolean; canApprove: boolean; suppliers: Supplier[] }) {
  const { format: fmt } = useCurrency();
  const [orders, setOrders] = useState<PO[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(canManage ? "active" : "approval");
  const [editing, setEditing] = useState<PO | "new" | null>(null);
  const [receiving, setReceiving] = useState<PO | null>(null);
  const [rejecting, setRejecting] = useState<PO | null>(null);

  const load = useCallback(async () => {
    const [o, s] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select("*, jobs(ref), purchase_order_items(id, item_id, request_item_id, description, quantity, unit_cost, quantity_received, position)")
        .order("created_at", { ascending: false })
        .limit(200),
      canManage ? supabase.from("inventory_items").select("id, name, unit, unit_cost, quantity, min_stock, supplier_id").order("name") : Promise.resolve({ data: [] }),
    ]);
    setOrders(
      ((o.data ?? []) as unknown as PO[]).map((p) => ({
        ...p,
        subtotal: Number(p.subtotal),
        purchase_order_items: [...p.purchase_order_items].sort((a, b) => a.position - b.position).map((l) => ({ ...l, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost), quantity_received: Number(l.quantity_received) })),
      })),
    );
    setStock(((s.data ?? []) as StockItem[]).map((i) => ({ ...i, unit_cost: Number(i.unit_cost), quantity: Number(i.quantity) })));
    setLoading(false);
  }, [canManage]);
  useEffect(() => {
    void load();
  }, [load]);

  const supplierName = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const statuses = FILTERS.find((f) => f.value === filter)?.statuses ?? [];
  const shown = orders.filter((o) => statuses.includes(o.status));
  const count = (v: string) => orders.filter((o) => FILTERS.find((f) => f.value === v)!.statuses.includes(o.status)).length;

  const call = async (fn: () => PromiseLike<{ error: { message: string } | null }>, success: string) => {
    const { error } = await fn();
    if (error) return toast.error(error.message);
    toast.success(success);
    void load();
  };

  const openQuote = async (po: PO) => {
    if (!po.quote_file_path) return;
    const { data } = await supabase.storage.from("inventory-docs").createSignedUrl(po.quote_file_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ListControls filters={FILTERS.map((f) => ({ value: f.value, label: f.label, count: count(f.value) }))} filter={filter} onFilterChange={setFilter} />
        {canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            New purchase order
          </Button>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : shown.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-10 text-center">
          <EmptyState title={filter === "approval" ? "Nothing to approve" : "No purchase orders here"} description={canManage && filter === "active" ? "Start one here, or order a part straight from Parts requests." : undefined} />
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((po) => {
            const state = PO_STATE[po.status];
            const cur = po.currency ?? undefined;
            return (
              <li key={po.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      {po.po_number}
                      {po.jobs?.ref && ` · for ${po.jobs.ref}`}
                    </p>
                    <p className="text-sm font-semibold">{po.supplier_id ? supplierName[po.supplier_id] ?? "Supplier" : "No supplier"}</p>
                    <p className="text-xs text-muted-foreground">
                      Started {formatDate(po.created_at)}
                      {po.expected_at && ` · expected ${formatDate(po.expected_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{fmt(po.subtotal, cur)}</span>
                    <StatusPill tone={state.tone}>{state.label}</StatusPill>
                  </div>
                </div>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {po.purchase_order_items.map((l, i) => (
                    <li key={l.id ?? i} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        {l.description} <span className="text-muted-foreground">× {l.quantity}</span>
                        {l.quantity_received > 0 && l.quantity_received < l.quantity && <span className="text-muted-foreground"> ({l.quantity_received} received)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(l.quantity * l.unit_cost, cur)}</span>
                    </li>
                  ))}
                </ul>
                {po.notes && <p className="mt-2 text-sm text-muted-foreground">{po.notes}</p>}
                {po.decision_note && <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-sm">Approver's note: {po.decision_note}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {po.quote_file_path && (
                    <Button size="sm" variant="ghost" onClick={() => void openQuote(po)}>
                      <FileText className="mr-1.5 h-4 w-4" aria-hidden />
                      Supplier quote
                    </Button>
                  )}
                  {canManage && po.status === "draft" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(po)}>
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => void call(() => supabase.rpc("submit_purchase_order", { _po_id: po.id }), `${po.po_number} sent for approval`)}>
                        Submit for approval
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void call(() => supabase.from("purchase_orders").delete().eq("id", po.id), `${po.po_number} deleted`)}>
                        Delete draft
                      </Button>
                    </>
                  )}
                  {canApprove && po.status === "pending_approval" && (
                    <>
                      <Button size="sm" onClick={() => void call(() => supabase.rpc("decide_purchase_order", { _po_id: po.id, _approve: true }), `${po.po_number} approved`)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRejecting(po)}>
                        Reject
                      </Button>
                    </>
                  )}
                  {canManage && po.status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => void call(() => supabase.rpc("mark_purchase_ordered", { _po_id: po.id }), `${po.po_number} marked as ordered`)}>
                      Mark as ordered
                    </Button>
                  )}
                  {canManage && (po.status === "approved" || po.status === "ordered") && (
                    <Button size="sm" onClick={() => setReceiving(po)}>
                      Receive goods
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <OrderEditor
          po={editing === "new" ? null : editing}
          suppliers={suppliers}
          stock={stock}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {receiving && (
        <ReceiveDialog
          po={receiving}
          onClose={() => setReceiving(null)}
          onDone={() => {
            setReceiving(null);
            void load();
          }}
        />
      )}
      {rejecting && (
        <RejectDialog
          po={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            const po = rejecting;
            setRejecting(null);
            void call(() => supabase.rpc("decide_purchase_order", { _po_id: po.id, _approve: false, _note: note }), `${po.po_number} rejected`);
          }}
        />
      )}
    </div>
  );
}

type EditLine = { item_id: string; description: string; quantity: string; unit_cost: string; request_item_id?: string | null };
const FREE = "__free__";

function OrderEditor({ po, suppliers, stock, onClose, onSaved }: { po: PO | null; suppliers: Supplier[]; stock: StockItem[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { currency: base, enabled, format: fmt } = useCurrency();
  const [supplierId, setSupplierId] = useState(po?.supplier_id ?? suppliers[0]?.id ?? "");
  const [currency, setCurrency] = useState(po?.currency ?? base);
  const [expected, setExpected] = useState(po?.expected_at ?? "");
  const [notes, setNotes] = useState(po?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<EditLine[]>(
    po?.purchase_order_items.length
      ? po.purchase_order_items.map((l) => ({ item_id: l.item_id ?? FREE, description: l.description, quantity: String(l.quantity), unit_cost: String(l.unit_cost), request_item_id: l.request_item_id }))
      : [{ item_id: FREE, description: "", quantity: "1", unit_cost: "" }],
  );
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

  const setLine = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickItem = (i: number, id: string) => {
    const item = stock.find((s) => s.id === id);
    setLine(i, { item_id: id, ...(item ? { description: item.name, unit_cost: lines[i].unit_cost || String(item.unit_cost) } : {}) });
  };

  const save = async () => {
    if (!supplierId) return toast.error("Pick a supplier (add one on the Suppliers page first)");
    const valid = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
    if (valid.length === 0) return toast.error("Add at least one line with a quantity");
    setSaving(true);
    const fields = { supplier_id: supplierId, currency, expected_at: expected || null, notes: notes.trim() || null };
    let id = po?.id;
    if (po) {
      const { error } = await supabase.from("purchase_orders").update(fields).eq("id", po.id);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      await supabase.from("purchase_order_items").delete().eq("po_id", po.id);
    } else {
      const { data, error } = await supabase.from("purchase_orders").insert({ ...fields, created_by: user?.id }).select("id").single();
      if (error || !data) {
        setSaving(false);
        return toast.error(error?.message ?? "Couldn't save");
      }
      id = data.id;
    }
    const { error: lineErr } = await supabase.from("purchase_order_items").insert(
      valid.map((l, i) => ({
        po_id: id!,
        item_id: l.item_id === FREE ? null : l.item_id,
        request_item_id: l.request_item_id ?? null,
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost) || 0,
        position: i,
      })),
    );
    if (lineErr) {
      setSaving(false);
      return toast.error(lineErr.message);
    }
    if (file) {
      const path = `po/${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("inventory-docs").upload(path, file);
      if (upErr) toast.error(`The order is saved, but the quote didn't upload: ${upErr.message}`);
      else await supabase.from("purchase_orders").update({ quote_file_path: path, quote_file_name: file.name }).eq("id", id!);
    }
    setSaving(false);
    toast.success("Saved as a draft");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{po ? `Edit ${po.po_number}` : "New purchase order"}</DialogTitle>
          <DialogDescription>Attach the supplier's quote so the approver can check the price.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="f-po-supplier">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="f-po-supplier">
                  <SelectValue placeholder="Pick a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-po-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="f-po-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([base, ...enabled])].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Lines</legend>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[12rem_1fr_4.5rem_6rem_2.5rem] sm:border-0 sm:p-0">
                  <Select value={l.item_id} onValueChange={(v) => pickItem(i, v)}>
                    <SelectTrigger aria-label={`Line ${i + 1} stock item`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FREE}>New or non-stock item</SelectItem>
                      {stock.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="What you're buying" />
                  <Input aria-label={`Line ${i + 1} quantity`} type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <Input aria-label={`Line ${i + 1} unit cost`} type="number" min={0} step={0.01} value={l.unit_cost} onChange={(e) => setLine(i, { unit_cost: e.target.value })} placeholder="Unit cost" />
                  <Button type="button" size="icon" variant="ghost" className="h-10 w-10" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { item_id: FREE, description: "", quantity: "1", unit_cost: "" }])}>
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Add line
              </Button>
              <span className="text-sm">
                Total <span className="font-semibold tabular-nums">{fmt(total, currency)}</span>
              </span>
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="f-po-expected">Expected delivery (optional)</Label>
              <DatePickerInput id="f-po-expected" value={expected} onChange={setExpected} />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium">Supplier quote</span>
              <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-hidden accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileInput.current?.click()}>
                <Paperclip className="mr-1.5 h-4 w-4" aria-hidden />
                <span className="truncate">{file?.name ?? po?.quote_file_name ?? "Attach the quote (PDF or photo)"}</span>
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="f-po-notes">Notes (optional)</Label>
            <Textarea id="f-po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ po, onClose, onDone }: { po: PO; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(po.purchase_order_items.map((l) => [l.id!, String(Math.max(l.quantity - l.quantity_received, 0))])));
  const [saving, setSaving] = useState(false);
  const receive = async () => {
    const lines = Object.entries(qty)
      .map(([line_id, q]) => ({ line_id, quantity: Number(q) || 0 }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return toast.error("Enter what arrived");
    setSaving(true);
    const { data, error } = await supabase.rpc("receive_purchase_order", { _po_id: po.id, _lines: lines });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(data === "received" ? `${po.po_number} received in full. Stock updated.` : `Part delivery recorded on ${po.po_number}.`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receive {po.po_number}</DialogTitle>
          <DialogDescription>Enter what actually arrived. Stock goes up and costs are averaged in. Parts ordered for a project are then ready to issue.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {po.purchase_order_items.map((l) => (
            <li key={l.id} className="grid grid-cols-[1fr_6rem] items-center gap-3">
              <Label htmlFor={`rcv-${l.id}`} className="text-sm font-normal">
                {l.description}
                <span className="block text-xs text-muted-foreground">
                  {l.quantity_received} of {l.quantity} received so far
                </span>
              </Label>
              <Input id={`rcv-${l.id}`} type="number" min={0} step="any" value={qty[l.id!] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.id!]: e.target.value }))} />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void receive()} disabled={saving}>
            {saving ? "Saving…" : "Receive into stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ po, onClose, onConfirm }: { po: PO; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {po.po_number}?</DialogTitle>
          <DialogDescription>Stores sees your reason and can revise the order.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-po-reject">Reason</Label>
          <Textarea id="f-po-reject" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="e.g. Get a second quote; this is 30% over last time" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(note.trim())} disabled={!note.trim()}>
            Reject order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
