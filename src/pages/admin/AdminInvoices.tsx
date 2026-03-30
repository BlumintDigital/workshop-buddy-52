import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", sent: "secondary", paid: "default", overdue: "destructive", cancelled: "destructive",
};

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);

  const fetchInvoices = async () => {
    const { data } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
    setInvoices(data || []);
  };

  useEffect(() => { fetchInvoices(); }, []);

  const handleStatusChange = async (id: string, status: string) => {
    const update: any = { status };
    if (status === "paid") update.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(update).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status updated to ${status}`);
    fetchInvoices();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Invoices</h2>
            <p className="text-muted-foreground">Manage all invoices</p>
          </div>
          <Link to="/invoices/new">
            <Button><Plus className="mr-2 h-4 w-4" />New Invoice</Button>
          </Link>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices</TableCell></TableRow>
                ) : invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>
                      <Select value={inv.status} onValueChange={(v) => handleStatusChange(inv.id, v)}>
                        <SelectTrigger className="w-28 h-8">
                          <Badge variant={statusColors[inv.status]}>{inv.status}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {["draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>${Number(inv.total).toFixed(2)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{inv.due_date || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
