import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchProfileNames } from "@/lib/profileNames";
import { formatDate } from "@/lib/format";
import { projectPath } from "@/lib/projects";
import type { StockItem, Supplier } from "@/components/inventory/StockSection";

type Line = { id: string; item_id: string | null; description: string; quantity: number; quantity_issued: number; status: string };
type Request = {
  id: string;
  job_id: string;
  status: string;
  needed_by: string | null;
  notes: string | null;
  requested_by: string | null;
  created_at: string;
  jobs: { ref: string; title: string } | null;
  stock_request_items: Line[];
};

const LINE_STATE: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: "To issue", tone: "warning" },
  ordering: { label: "On order", tone: "info" },
  issued: { label: "Issued", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Parts the workshop has asked for, grouped by project, with issue and order actions for stores. */
export default function RequestsSection({ canManage, suppliers }: { canManage: boolean; suppliers: Supplier[] }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [issuing, setIssuing] = useState<{ request: Request; line: Line } | null>(null);
  const [ordering, setOrdering] = useState<{ request: Request; line: Line } | null>(null);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([
      supabase
        .from("stock_requests")
        .select("id, job_id, status, needed_by, notes, requested_by, created_at, jobs(ref, title), stock_request_items(id, item_id, description, quantity, quantity_issued, status)")
        .order("created_at", { ascending: true })
        .limit(200),
      supabase.from("inventory_items").select("id, name, sku, unit, unit_cost, quantity, min_stock, supplier_id").order("name"),
    ]);
    const rows = (r.data ?? []) as unknown as Request[];
    setNames(await fetchProfileNames(rows.map((x) => x.requested_by)));
    setRequests(rows);
    setStock(((s.data ?? []) as StockItem[]).map((i) => ({ ...i, quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) })));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const stockById = useMemo(() => Object.fromEntries(stock.map((i) => [i.id, i])), [stock]);
  const open = requests.filter((r) => r.status === "open" || r.status === "partial");
  const shown = filter === "open" ? open : requests.filter((r) => r.status === "fulfilled" || r.status === "cancelled").reverse();

  const cancelLine = async (req: Request, line: Line) => {
    const { error } = await supabase.from("stock_request_items").update({ status: "cancelled" }).eq("id", line.id);
    if (error) return toast.error(error.message);
    const others = req.stock_request_items.filter((l) => l.id !== line.id);
    if (others.every((l) => l.status === "issued" || l.status === "cancelled")) {
      await supabase.from("stock_requests").update({ status: others.some((l) => l.status === "issued") ? "fulfilled" : "cancelled" }).eq("id", req.id);
    }
    toast.success(`Cancelled ${line.description}`);
    void load();
  };

  return (
    <div className="space-y-4">
      <ListControls
        filters={[
          { value: "open", label: "Waiting", count: open.length },
          { value: "done", label: "Done" },
        ]}
        filter={filter}
        onFilterChange={setFilter}
      />
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : shown.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-10 text-center">
          <EmptyState title={filter === "open" ? "No parts waiting" : "Nothing here yet"} description={filter === "open" ? "Parts requested from project pages appear here." : undefined} />
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((req) => (
            <li key={req.id} className="rounded-lg border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0">
                  <Link to={projectPath(req.job_id)} className="font-mono text-xs text-muted-foreground hover:underline">
                    {req.jobs?.ref}
                  </Link>
                  <p className="text-sm font-semibold">{req.jobs?.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Asked by {req.requested_by ? names[req.requested_by] ?? "a team member" : "a team member"} · {formatDate(req.created_at)}
                    {req.needed_by && ` · needed by ${formatDate(req.needed_by)}`}
                  </p>
                  {req.notes && <p className="mt-1 text-sm text-muted-foreground">{req.notes}</p>}
                </div>
              </div>
              <ul className="divide-y">
                {req.stock_request_items.map((line) => {
                  const item = line.item_id ? stockById[line.item_id] : undefined;
                  const state = LINE_STATE[line.status] ?? LINE_STATE.open;
                  const remaining = line.quantity - line.quantity_issued;
                  const active = line.status === "open" || line.status === "ordering";
                  return (
                    <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {line.description} <span className="font-normal text-muted-foreground">× {line.quantity}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item ? `${item.quantity} ${item.unit} on the shelf` : "Not a stock item yet"}
                          {line.quantity_issued > 0 && line.status !== "issued" && ` · ${line.quantity_issued} issued`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                        {canManage && active && (
                          <>
                            <Button size="sm" onClick={() => setIssuing({ request: req, line })} disabled={remaining <= 0}>
                              Issue<span className="sr-only"> {line.description}</span>
                            </Button>
                            {line.status === "open" && (
                              <Button size="sm" variant="outline" onClick={() => setOrdering({ request: req, line })}>
                                Order<span className="sr-only"> {line.description}</span>
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => void cancelLine(req, line)}>
                              Cancel<span className="sr-only"> {line.description}</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {issuing && (
        <IssueDialog
          line={issuing.line}
          projectRef={issuing.request.jobs?.ref ?? ""}
          stock={stock}
          onClose={() => setIssuing(null)}
          onDone={() => {
            setIssuing(null);
            void load();
          }}
        />
      )}
      {ordering && (
        <OrderDialog
          line={ordering.line}
          jobId={ordering.request.job_id}
          item={ordering.line.item_id ? stockById[ordering.line.item_id] : undefined}
          suppliers={suppliers}
          onClose={() => setOrdering(null)}
          onDone={() => {
            setOrdering(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function IssueDialog({ line, projectRef, stock, onClose, onDone }: { line: Line; projectRef: string; stock: StockItem[]; onClose: () => void; onDone: () => void }) {
  const [itemId, setItemId] = useState(line.item_id ?? "");
  const [qty, setQty] = useState(String(line.quantity - line.quantity_issued));
  const [saving, setSaving] = useState(false);
  const item = stock.find((s) => s.id === itemId);

  const issue = async () => {
    const n = Number(qty);
    if (!itemId) return toast.error("Pick the stock item");
    if (!(n > 0)) return toast.error("Enter how many to issue");
    setSaving(true);
    const { error } = await supabase.rpc("issue_parts", { _request_item_id: line.id, _quantity: n, _item_id: itemId || undefined });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Issued ${n} ${item?.unit ?? ""} ${item?.name ?? line.description} to ${projectRef}`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Issue {line.description}</DialogTitle>
          <DialogDescription>Stock goes down and the cost is added to {projectRef}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="f-issue-item">Stock item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger id="f-issue-item">
                <SelectValue placeholder="Pick the matching stock item" />
              </SelectTrigger>
              <SelectContent>
                {stock.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={s.quantity <= 0}>
                    {s.name} ({s.quantity} {s.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-issue-qty">Quantity</Label>
            <Input id="f-issue-qty" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            {item && Number(qty) > item.quantity && <p className="mt-1 text-xs text-destructive">Only {item.quantity} {item.unit} on the shelf. Order the rest.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void issue()} disabled={saving}>
            {saving ? "Issuing…" : "Issue parts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Adds the line to a draft purchase order for the chosen supplier (creating one if needed). */
function OrderDialog({ line, jobId, item, suppliers, onClose, onDone }: { line: Line; jobId: string; item?: StockItem; suppliers: Supplier[]; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [supplierId, setSupplierId] = useState(item?.supplier_id ?? suppliers[0]?.id ?? "");
  const [qty, setQty] = useState(String(line.quantity - line.quantity_issued));
  const [cost, setCost] = useState(item ? String(item.unit_cost) : "");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!supplierId) return toast.error("Add a supplier first, on the Suppliers page");
    const n = Number(qty);
    if (!(n > 0)) return toast.error("Enter a quantity");
    setSaving(true);
    const { data: existing } = await supabase.from("purchase_orders").select("id, po_number").eq("status", "draft").eq("supplier_id", supplierId).order("created_at").limit(1).maybeSingle();
    let po = existing;
    if (!po) {
      const { data, error } = await supabase.from("purchase_orders").insert({ supplier_id: supplierId, job_id: jobId, currency, created_by: user?.id }).select("id, po_number").single();
      if (error || !data) {
        setSaving(false);
        return toast.error(error?.message ?? "Couldn't start a purchase order");
      }
      po = data;
    }
    const { error } = await supabase.from("purchase_order_items").insert({
      po_id: po.id,
      item_id: line.item_id,
      request_item_id: line.id,
      description: item?.name ?? line.description,
      quantity: n,
      unit_cost: Number(cost) || 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Added to ${po.po_number}. Submit it for approval from Purchases.`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order {line.description}</DialogTitle>
          <DialogDescription>Adds it to a draft purchase order for the supplier. The order is approved before it's placed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="f-order-supplier">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="f-order-supplier">
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="f-order-qty">Quantity</Label>
              <Input id="f-order-qty" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="f-order-cost">Unit cost ({currency})</Label>
              <Input id="f-order-cost" type="number" min={0} step={0.01} value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void add()} disabled={saving}>
            {saving ? "Adding…" : "Add to purchase order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
