import PageActions from "@/components/admin/PageActions";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { useCurrency } from "@/hooks/useCurrency";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", sent: "secondary", paid: "default", overdue: "destructive", cancelled: "destructive",
};

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const { page, setPage } = usePagination();
  const { role } = useAuth();
  const { format: fmt } = useCurrency();

  const fetchInvoices = async (currentPage = page) => {
    setIsLoading(true);
    const { data, count } = await supabase
      .from("invoices")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    setTotalCount(count ?? 0);
    if (!data) { setInvoices([]); setIsLoading(false); return; }

    const clientIds = [...new Set(data.map(i => i.client_id).filter(Boolean))];
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", clientIds);
      if (profiles) {
        const map: Record<string, string> = {};
        profiles.forEach(p => { map[p.id] = p.full_name || "Unknown"; });
        setClientNames(map);
      }
    }
    setInvoices(data);
    setIsLoading(false);
  };

  useEffect(() => { fetchInvoices(page); }, [page]);

  const handleDelete = async (id: string) => {
    await supabase.from("invoice_items").delete().eq("invoice_id", id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Invoice deleted");
    fetchInvoices(page);
  };

  const handleStatusChange = async (id: string, status: string) => {
    const update: any = { status };
    if (status === "paid") update.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(update).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status updated to ${status}`);
    fetchInvoices(page);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Invoices</h2>
            <p className="text-muted-foreground">Manage all invoices</p>
          </div>
          <PageActions>
            <Link to="/invoices/new">
              <Button className="w-full"><Plus className="mr-2 h-4 w-4" />New Invoice</Button>
            </Link>
          </PageActions>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  {role === "admin" && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                )) : invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={role === "admin" ? 7 : 6} className="text-center py-8 text-muted-foreground">No invoices</TableCell></TableRow>
                ) : invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link to={`/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{clientNames[inv.client_id] || "—"}</TableCell>
                    <TableCell>
                      <Select value={inv.status} onValueChange={(v) => handleStatusChange(inv.id, v)}>
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue>
                            <Badge variant={statusColors[inv.status]}>{inv.status}</Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {["draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{fmt(Number(inv.total), (inv as any).currency)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{inv.due_date || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    {role === "admin" && (
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete {inv.invoice_number}. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(inv.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
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
    </DashboardLayout>
  );
}
