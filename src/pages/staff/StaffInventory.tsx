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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function StaffInventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: "out", quantity: "1", notes: "" });
  const [isLoading, setIsLoading] = useState(true);

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

  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
    </TableRow>
  ));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">View and log stock usage</p>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? skeletonRows : items.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No items</TableCell></TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.sku || "—"}</TableCell>
                    <TableCell>{item.quantity} {item.unit}</TableCell>
                    <TableCell>{item.quantity <= item.min_stock ? <Badge variant="destructive">Low</Badge> : <Badge variant="outline">OK</Badge>}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => handleOpenAdjust(item)}>Log Usage</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={adjustOpen} onOpenChange={(v) => { setAdjustOpen(v); if (!v) setAdjustItem(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Stock — {adjustItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current: <span className="font-medium text-foreground">{adjustItem?.quantity} {adjustItem?.unit}</span>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={adjustForm.type} onValueChange={(v) => setAdjustForm({ ...adjustForm, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="out">Used (stock out)</SelectItem>
                  <SelectItem value="in">Returned (stock in)</SelectItem>
                  <SelectItem value="adjustment">Set exact quantity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{adjustForm.type === "adjustment" ? "New Quantity" : "Quantity"}</Label>
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
                placeholder="Which job? Any details..."
              />
            </div>
            <Button onClick={handleAdjust} className="w-full">Log</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
