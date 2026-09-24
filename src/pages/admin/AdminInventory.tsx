import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { useCurrency } from "@/hooks/useCurrency";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";

export default function AdminInventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", category: "", quantity: "0", min_stock: "0", unit_cost: "0", unit: "pcs" });
  const { page, setPage, reset } = usePagination();
  const { format: fmt } = useCurrency();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleting, setDeleting] = useState<any | null>(null);

  // Adjust stock dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: "out", quantity: "1", notes: "" });

  const fetchItems = async (currentPage = page, currentFilter = filter, currentSearch = debouncedSearch) => {
    setIsLoading(true);
    const term = currentSearch.trim().replace(/[%,()]/g, " ");
    if (currentFilter === "low") {
      // Low stock compares two columns, which PostgREST can't filter on, so filter client-side.
      let query = supabase.from("inventory_items").select("*").order("name");
      if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      const { data } = await query;
      const low = (data || []).filter((i: any) => i.quantity <= i.min_stock);
      setTotalCount(low.length);
      setItems(low.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE));
      setIsLoading(false);
      return;
    }
    let query = supabase.from("inventory_items").select("*", { count: "exact" }).order("name");
    if (term) query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    const { data, count } = await query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);
    setTotalCount(count ?? 0);
    setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      reset();
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchItems(page, filter, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, debouncedSearch]);

  const handleCreate = async () => {
    const { error } = await supabase.from("inventory_items").insert({
      name: form.name, sku: form.sku || null, category: form.category || null,
      quantity: parseInt(form.quantity), min_stock: parseInt(form.min_stock),
      unit_cost: parseFloat(form.unit_cost), unit: form.unit,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Item added");
    setOpen(false);
    setForm({ name: "", sku: "", category: "", quantity: "0", min_stock: "0", unit_cost: "0", unit: "pcs" });
    fetchItems(page);
  };

  const handleOpenAdjust = (item: any) => {
    setAdjustItem(item);
    setAdjustForm({ type: "out", quantity: "1", notes: "" });
    setAdjustOpen(true);
  };

  const handleDelete = async (item: any) => {
    setDeleting(null);
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) { toast.error("Couldn't delete: " + error.message); return; }
    toast.success(`Deleted ${item.name}`);
    fetchItems(page);
  };

  const handleAdjust = async () => {
    if (!adjustItem) return;
    if (!user) { toast.error("You must be logged in"); return; }
    const qty = parseInt(adjustForm.quantity);
    if (isNaN(qty) || qty <= 0) { toast.error("Enter a valid quantity"); return; }

    let newQuantity: number;
    if (adjustForm.type === "in") newQuantity = adjustItem.quantity + qty;
    else if (adjustForm.type === "out") newQuantity = Math.max(0, adjustItem.quantity - qty);
    else newQuantity = qty; // adjustment = set directly

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

    toast.success("Stock updated");
    setAdjustOpen(false);
    setAdjustItem(null);
    fetchItems(page);
  };

  const filters: FilterOption[] = [
    { value: "all", label: "All items" },
    { value: "low", label: "Low stock" },
  ];

  const columns: Column<any>[] = [
    { key: "name", header: "Item", cell: (item) => <span className="font-medium">{item.name}</span> },
    { key: "sku", header: "SKU", cell: (item) => item.sku || "—", hideBelow: "md" },
    { key: "category", header: "Category", cell: (item) => item.category || "—", hideBelow: "lg" },
    { key: "qty", header: "In stock", cell: (item) => `${item.quantity} ${item.unit ?? ""}`.trim(), align: "right" },
    { key: "min", header: "Reorder at", cell: (item) => item.min_stock, align: "right", hideBelow: "md" },
    { key: "cost", header: "Unit cost", cell: (item) => fmt(Number(item.unit_cost)), align: "right", hideBelow: "lg" },
    { key: "status", header: "Status", cell: (item) => <StockPill item={item} /> },
  ];

  const hasQuery = filter !== "all" || debouncedSearch.trim() !== "";

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Inventory"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? "item" : "items"}${filter === "low" ? " at or below reorder level" : ""}`}
          actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus />Add item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                <div><Label>Min Stock</Label><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} /></div>
                <div><Label>Unit Cost</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></div>
              </div>
              <Button onClick={handleCreate} className="w-full">Add Item</Button>
            </div>
          </DialogContent>
        </Dialog>
          }
        />

        <ListControls
          filters={filters}
          filter={filter}
          onFilterChange={(v) => { setFilter(v); reset(); }}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name or SKU"
        />

        <DataList
          rows={items}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          mobile={{
            title: (item) => item.name,
            trailing: (item) => <StockPill item={item} />,
            meta: (item) => [`${item.quantity} ${item.unit ?? ""} in stock`, `reorder at ${item.min_stock}`, item.sku].filter(Boolean).join(" · "),
          }}
          actions={(item) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${item.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="min-h-[40px]" onClick={() => handleOpenAdjust(item)}>Adjust stock</DropdownMenuItem>
                <DropdownMenuItem className="min-h-[40px] text-destructive focus:text-destructive" onClick={() => setDeleting(item)}>Delete item</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          empty={
            hasQuery ? (
              <EmptyState title={filter === "low" ? "Nothing is low on stock" : "No items match"} description={filter === "low" ? "Every item is above its reorder level." : "Try another search."} />
            ) : (
              <EmptyState title="No inventory yet" description="Add the materials and parts you track, with a reorder level for each." action={<Button onClick={() => setOpen(true)}><Plus />Add item</Button>} />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="items" />
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>The item and its stock level are removed permanently. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep item</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDelete(deleting)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete item</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Adjust Stock dialog */}
      <Dialog open={adjustOpen} onOpenChange={(v) => { setAdjustOpen(v); if (!v) setAdjustItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust stock: {adjustItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current quantity: <span className="font-medium text-foreground">{adjustItem?.quantity} {adjustItem?.unit}</span>
            </div>
            <div>
              <Label>Transaction Type</Label>
              <Select value={adjustForm.type} onValueChange={(v) => setAdjustForm({ ...adjustForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock In (add)</SelectItem>
                  <SelectItem value="out">Stock Out (remove)</SelectItem>
                  <SelectItem value="adjustment">Set Exact Quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                {adjustForm.type === "adjustment" ? "New Quantity" : "Quantity"}
              </Label>
              <Input
                type="number"
                min="1"
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                className="mt-1"
                rows={2}
                placeholder="Reason for adjustment..."
              />
            </div>
            <Button onClick={handleAdjust} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function StockPill({ item }: { item: { quantity: number; min_stock: number } }) {
  if (item.quantity <= 0) return <StatusPill tone="danger">Out of stock</StatusPill>;
  if (item.quantity <= item.min_stock) return <StatusPill tone="warning">Low stock</StatusPill>;
  return <StatusPill tone="success">In stock</StatusPill>;
}
