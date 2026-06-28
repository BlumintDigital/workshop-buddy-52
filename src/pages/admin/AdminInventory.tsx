import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminInventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", category: "", quantity: "0", min_stock: "0", unit_cost: "0", unit: "pcs" });
  const { page, setPage } = usePagination();

  // Adjust stock dialog
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: "out", quantity: "1", notes: "" });

  const fetchItems = async (currentPage = page) => {
    setIsLoading(true);
    const { data, count } = await supabase
      .from("inventory_items")
      .select("*", { count: "exact" })
      .order("name")
      .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);
    setTotalCount(count ?? 0);
    setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchItems(page); }, [page]);

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
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) { toast.error("Failed to delete: " + error.message); return; }
    toast.success("Item deleted");
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Inventory</h2>
            <p className="text-muted-foreground">Manage workshop inventory</p>
          </div>
          <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Item</Button>
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
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead className="hidden sm:table-cell">Min Stock</TableHead>
                  <TableHead className="hidden md:table-cell">Unit Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                )) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No items</TableCell></TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{item.sku || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{item.category || "—"}</TableCell>
                    <TableCell>{item.quantity} {item.unit}</TableCell>
                    <TableCell className="hidden sm:table-cell">{item.min_stock}</TableCell>
                    <TableCell className="hidden md:table-cell">${Number(item.unit_cost).toFixed(2)}</TableCell>
                    <TableCell>
                      {item.quantity <= item.min_stock ? (
                        <Badge variant="destructive">Low Stock</Badge>
                      ) : (
                        <Badge variant="outline">In Stock</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenAdjust(item)}>Adjust Stock</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item)}>Delete Item</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {Math.ceil(totalCount / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => setPage(p => Math.max(0, p - 1))} aria-disabled={page === 0} className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 py-1 text-sm">Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}</span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext onClick={() => setPage(p => Math.min(Math.ceil(totalCount / PAGE_SIZE) - 1, p + 1))} aria-disabled={page >= Math.ceil(totalCount / PAGE_SIZE) - 1} className={page >= Math.ceil(totalCount / PAGE_SIZE) - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {/* Adjust Stock dialog */}
      <Dialog open={adjustOpen} onOpenChange={(v) => { setAdjustOpen(v); if (!v) setAdjustItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock — {adjustItem?.name}</DialogTitle>
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
