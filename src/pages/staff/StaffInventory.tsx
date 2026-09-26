import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageBar } from "@/components/dashboard/PageBar";
import { StockPill } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { toast } from "sonner";
import { plural } from "@/lib/format";

export default function StaffInventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: "out", quantity: "1", notes: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchItems = async () => {
    setIsLoading(true);
    const { data } = await supabase.from("inventory_items")
      .select("id, name, sku, quantity, unit, min_stock")
      .order("name")
      .limit(500);
    setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const handleOpenAdjust = (item: any) => {
    setAdjustItem(item);
    setAdjustForm({ type: "out", quantity: "1", notes: "" });
    setAdjustOpen(true);
  };

  const handleAdjust = async () => {
    if (!adjustItem) return;
    if (!user) { toast.error("You must be logged in"); return; }
    const qty = parseInt(adjustForm.quantity);
    if (isNaN(qty) || qty <= 0) { toast.error("Enter a valid quantity"); return; }

    let newQuantity: number;
    if (adjustForm.type === "in") newQuantity = adjustItem.quantity + qty;
    else if (adjustForm.type === "out") newQuantity = Math.max(0, adjustItem.quantity - qty);
    else newQuantity = qty;

    const { error: txError } = await supabase.from("inventory_transactions").insert({
      item_id: adjustItem.id,
      user_id: user.id,
      type: adjustForm.type,
      quantity: qty,
      notes: adjustForm.notes || null,
    });
    if (txError) { toast.error("Failed to log transaction: " + txError.message); return; }

    const { data: updated, error: updateError } = await supabase
      .from("inventory_items")
      .update({ quantity: newQuantity })
      .eq("id", adjustItem.id)
      .select();
    if (updateError) { toast.error("Failed to update stock: " + updateError.message); return; }
    if (!updated || updated.length === 0) { toast.error("Stock update was blocked. Please try again."); return; }

    toast.success("Stock logged");
    setAdjustOpen(false);
    setAdjustItem(null);
    fetchItems();
  };

  const isLow = (item: any) => item.quantity <= item.min_stock;
  const low = items.filter(isLow);
  const q = search.trim().toLowerCase();
  const rows = (filter === "low" ? low : items).filter(
    (item) => !q || item.name?.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q),
  );
  const qty = (item: any) => `${item.quantity} ${item.unit ?? ""}`.trim();

  const columns: Column<any>[] = [
    { key: "name", header: "Item", cell: (item) => <span className="font-medium">{item.name}</span> },
    { key: "sku", header: "SKU", cell: (item) => item.sku || "—", hideBelow: "md" },
    { key: "status", header: "Status", cell: (item) => <StockPill item={item} /> },
    { key: "qty", header: "In stock", cell: qty, align: "right" },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-4">
        <PageBar
          title="Inventory"
          subtitle={isLoading ? "Loading…" : `${plural(items.length, "item")}${low.length ? ` · ${low.length} low on stock` : ""} · log what you use on a job`}
        />
        <ListControls
          filters={[
            { value: "all", label: "All" },
            { value: "low", label: "Low stock", count: low.length },
          ]}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name or SKU"
        />
        <DataList
          rows={rows}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          actions={(item) => (
            <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => handleOpenAdjust(item)}>
              Log usage<span className="sr-only"> of {item.name}</span>
            </Button>
          )}
          mobile={{
            title: (item) => item.name,
            trailing: (item) => <StockPill item={item} />,
            meta: (item) => [`${qty(item)} in stock`, item.sku].filter(Boolean).join(" · "),
          }}
          empty={
            q || filter !== "all" ? (
              <EmptyState title={filter === "low" && !q ? "Nothing is low on stock" : "No items match"} description={q ? "Try another name or SKU." : undefined} />
            ) : (
              <EmptyState title="No stock items yet" description="An admin adds items on the inventory page. You can log usage once they exist." />
            )
          }
        />
      </div>

      <Dialog open={adjustOpen} onOpenChange={(v) => { setAdjustOpen(v); if (!v) setAdjustItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log stock: {adjustItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">{adjustItem?.quantity} {adjustItem?.unit}</span>
            </div>
            <div>
              <Label htmlFor="f-type">Type</Label>
              <Select value={adjustForm.type} onValueChange={(v) => setAdjustForm({ ...adjustForm, type: v })}>
                <SelectTrigger id="f-type" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Used (stock out)</SelectItem>
                  <SelectItem value="in">Returned (stock in)</SelectItem>
                  <SelectItem value="adjustment">Set exact quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-field">{adjustForm.type === "adjustment" ? "New Quantity" : "Quantity"}</Label>
              <Input id="f-field"
                type="number"
                min="1"
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="f-notes-optional">Notes (optional)</Label>
              <Textarea id="f-notes-optional"
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                className="mt-1"
                rows={2}
                placeholder="Which project? Any details…"
              />
            </div>
            <Button onClick={handleAdjust} className="w-full">Log</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
