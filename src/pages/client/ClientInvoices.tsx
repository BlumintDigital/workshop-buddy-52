import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useCurrency } from "@/hooks/useCurrency";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", sent: "secondary", paid: "default", overdue: "destructive", cancelled: "destructive",
};

export default function ClientInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const { format: fmt } = useCurrency();
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = async () => {
    setIsLoading(true);
    if (!user) { setIsLoading(false); return; }
    const { data } = await supabase.from("invoices").select("*").eq("client_id", user.id).in("status", ["sent", "paid", "overdue"]).order("created_at", { ascending: false }).limit(200);
    setInvoices(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchInvoices();
  }, [user]);

  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    </TableRow>
  ));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">My Invoices</h2>
          <p className="text-muted-foreground">View your invoices</p>
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
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? skeletonRows : invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices</TableCell></TableRow>
                ) : invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">
                      <Link to={`/invoices/${inv.id}`} className="text-primary hover:underline">{inv.invoice_number}</Link>
                    </TableCell>
                    <TableCell><Badge variant={statusColors[inv.status] || "outline"}>{inv.status}</Badge></TableCell>
                    <TableCell>{fmt(Number(inv.total))}</TableCell>
                    <TableCell className="hidden sm:table-cell">{inv.due_date || "—"}</TableCell>
                    <TableCell>
                      {inv.stripe_payment_url && inv.status !== "paid" && (
                        <Button variant="default" size="sm" asChild className="min-h-[44px]">
                          <a href={inv.stripe_payment_url} target="_blank" rel="noopener noreferrer">
                            Pay Now <ExternalLink className="ml-1 h-3 w-3" />
                          </a>
                        </Button>
                      )}
                    </TableCell>
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
