import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { StockPill } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/format";

export type StockItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  unit_cost: number;
  quantity: number;
  min_stock: number;
  reorder_quantity: number | null;
  supplier_id: string | null;
  location: string | null;
  description: string | null;
};
export type Supplier = { id: string; name: string };

const NONE = "__none__";

/** The stock list. Stores can add, edit and adjust; everyone else can look things up. */
export default function StockSection({ canManage, suppliers }: { canManage: boolean; suppliers: Supplier[] }) {
  const { format: fmt } = useCurrency();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StockItem | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, sku, category, unit, unit_cost, quantity, min_stock, reorder_quantity, supplier_id, location, description")
      .order("name");
    setItems(((data ?? []) as StockItem[]).map((i) => ({ ...i, unit_cost: Number(i.unit_cost), quantity: Number(i.quantity), min_stock: Number(i.min_stock) })));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const supplierName = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const low = items.filter((i) => i.quantity <= i.min_stock);
  const q = search.trim().toLowerCase();
  const rows = (filter === "low" ? low : items).filter(
    (i) => !q || i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q),
  );
  const value = items.reduce((s, i) => s + Math.max(i.quantity, 0) * i.unit_cost, 0);

  const columns: Column<StockItem>[] = [
    {
      key: "name",
      header: "Item",
      cell: (i) => (
        <span>
          <span className="block font-medium">{i.name}</span>
          {(i.sku || i.location) && <span className="text-xs text-muted-foreground">{[i.sku, i.location].filter(Boolean).join(" · ")}</span>}
        </span>
      ),
    },
    { key: "supplier", header: "Supplier", cell: (i) => (i.supplier_id ? supplierName[i.supplier_id] ?? "—" : "—"), hideBelow: "lg" },
    { key: "status", header: "Status", cell: (i) => <StockPill item={i} /> },
    { key: "qty", header: "In stock", cell: (i) => `${i.quantity} ${i.unit}`, align: "right" },
    { key: "min", header: "Reorder at", cell: (i) => i.min_stock, align: "right", hideBelow: "md" },
    { key: "cost", header: "Unit cost", cell: (i) => fmt(i.unit_cost), align: "right", hideBelow: "md" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {plural(items.length, "item")} · {low.length} low · stock value {fmt(value)}
        </p>
        {canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Add item
          </Button>
        )}
      </div>
      <ListControls
        filters={[
          { value: "all", label: "All items" },
          { value: "low", label: "Low stock", count: low.length },
        ]}
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, SKU or location"
      />
      <DataList
        rows={rows}
        columns={columns}
        isLoading={loading}
        getRowKey={(i) => i.id}
        actions={
          canManage
            ? (i) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${i.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setAdjusting(i)}>Adjust stock</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditing(i)}>Edit item</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            : undefined
        }
        mobile={{
          title: (i) => i.name,
          trailing: (i) => <StockPill item={i} />,
          meta: (i) => [`${i.quantity} ${i.unit} in stock`, i.location, fmt(i.unit_cost) + " each"].filter(Boolean).join(" · "),
        }}
        empty={
          q || filter !== "all" ? (
            <EmptyState title="Nothing matches" description="Try another search or filter." />
          ) : (
            <EmptyState title="No stock items yet" description={canManage ? "Add the parts and materials you keep on the shelf." : "Stores hasn't added any items yet."} />
          )
        }
      />

      {editing && (
        <ItemDialog
          item={editing === "new" ? null : editing}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {adjusting && (
        <AdjustDialog
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function ItemDialog({ item, suppliers, onClose, onSaved }: { item: StockItem | null; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    category: item?.category ?? "",
    unit: item?.unit ?? "pcs",
    unit_cost: item ? String(item.unit_cost) : "",
    quantity: item ? String(item.quantity) : "0",
    min_stock: item ? String(item.min_stock) : "0",
    reorder_quantity: item?.reorder_quantity != null ? String(item.reorder_quantity) : "",
    supplier_id: item?.supplier_id ?? NONE,
    location: item?.location ?? "",
    description: item?.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the item a name");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      unit: form.unit.trim() || "pcs",
      unit_cost: Number(form.unit_cost) || 0,
      min_stock: Number(form.min_stock) || 0,
      reorder_quantity: form.reorder_quantity ? Number(form.reorder_quantity) : null,
      supplier_id: form.supplier_id === NONE ? null : form.supplier_id,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      ...(item ? {} : { quantity: Number(form.quantity) || 0 }),
    };
    const { error } = item ? await supabase.from("inventory_items").update(payload).eq("id", item.id) : await supabase.from("inventory_items").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(item ? `${payload.name} saved` : `${payload.name} added`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : "Add a stock item"}</DialogTitle>
          {item && <DialogDescription>To change how many are on the shelf, use Adjust stock so the change is recorded.</DialogDescription>}
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="f-item-name">Name</Label>
            <Input id="f-item-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bearing 6204-2RS" />
          </div>
          <div>
            <Label htmlFor="f-item-sku">SKU or part number</Label>
            <Input id="f-item-sku" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-item-category">Category</Label>
            <Input id="f-item-category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Bearings" />
          </div>
          <div>
            <Label htmlFor="f-item-unit">Unit</Label>
            <Input id="f-item-unit" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="pcs, m, kg, L" />
          </div>
          <div>
            <Label htmlFor="f-item-cost">Unit cost</Label>
            <Input id="f-item-cost" type="number" min={0} step={0.01} value={form.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} />
          </div>
          {!item && (
            <div>
              <Label htmlFor="f-item-qty">Opening stock</Label>
              <Input id="f-item-qty" type="number" min={0} step="any" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="f-item-min">Reorder when at or below</Label>
            <Input id="f-item-min" type="number" min={0} step="any" value={form.min_stock} onChange={(e) => set("min_stock", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-item-reorder">Usual order quantity</Label>
            <Input id="f-item-reorder" type="number" min={0} step="any" value={form.reorder_quantity} onChange={(e) => set("reorder_quantity", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-item-supplier">Supplier</Label>
            <Select value={form.supplier_id} onValueChange={(v) => set("supplier_id", v)}>
              <SelectTrigger id="f-item-supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-item-location">Shelf location</Label>
            <Input id="f-item-location" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Rack B, bin 4" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-item-notes">Notes</Label>
            <Textarea id="f-item-notes" value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : item ? "Save item" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [type, setType] = useState<"in" | "out" | "adjustment">("in");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(qty);
    if (!(n >= 0) || (type !== "adjustment" && n <= 0)) return toast.error("Enter a quantity");
    if (type !== "in" && !note.trim()) return toast.error("Say why the stock is changing");
    setSaving(true);
    const next = type === "in" ? item.quantity + n : type === "out" ? Math.max(0, item.quantity - n) : n;
    const { error: txErr } = await supabase.from("inventory_transactions").insert({ item_id: item.id, user_id: user!.id, type, quantity: n, notes: note.trim() || null });
    if (txErr) {
      setSaving(false);
      return toast.error(txErr.message);
    }
    const { error } = await supabase.from("inventory_items").update({ quantity: next }).eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${item.name}: ${next} ${item.unit} in stock`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust {item.name}</DialogTitle>
          <DialogDescription>
            {item.quantity} {item.unit} in stock now. Parts for a project are issued from Parts requests, so they're costed to the project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="f-adjust-type">Change</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger id="f-adjust-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Add stock (delivery without a purchase order)</SelectItem>
                <SelectItem value="out">Remove stock (damaged, lost, used in-house)</SelectItem>
                <SelectItem value="adjustment">Set the exact count (stocktake)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-adjust-qty">{type === "adjustment" ? "Counted on the shelf" : "Quantity"}</Label>
            <Input id="f-adjust-qty" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-adjust-note">Reason{type === "in" ? " (optional)" : ""}</Label>
            <Input id="f-adjust-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
