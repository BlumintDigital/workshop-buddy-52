import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { clientFriendlyInvoiceStatus } from "@/lib/invoiceStatus";
import { formatDate, plural } from "@/lib/format";

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  currency: string | null;
  due_date: string | null;
  stripe_payment_url: string | null;
  client_marked_paid_at: string | null;
};

const TONE: Record<string, StatusTone> = { sent: "info", overdue: "danger", paid: "success", cancelled: "neutral" };

function statusPill(inv: Invoice) {
  // A payment the client reported but the workshop hasn't confirmed yet.
  const tone = inv.client_marked_paid_at && inv.status !== "paid" ? "warning" : (TONE[inv.status] ?? "neutral");
  return <StatusPill tone={tone}>{clientFriendlyInvoiceStatus(inv.status, inv.client_marked_paid_at)}</StatusPill>;
}

const isUnpaid = (inv: Invoice) => inv.status !== "paid" && inv.status !== "cancelled";

/** The client's invoices, unpaid first in the filter, with a pay link when one exists. */
export default function ClientInvoices() {
  const { user } = useAuth();
  const { format: fmt } = useCurrency();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, currency, due_date, stripe_payment_url, client_marked_paid_at")
      .eq("client_id", user.id)
      .in("status", ["sent", "paid", "overdue"])
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setInvoices((data || []) as Invoice[]);
        setIsLoading(false);
      });
  }, [user]);

  const unpaid = invoices.filter(isUnpaid);
  const rows = filter === "unpaid" ? unpaid : filter === "paid" ? invoices.filter((i) => i.status === "paid") : invoices;
  const total = (inv: Invoice) => fmt(Number(inv.total), inv.currency ?? undefined);

  const columns: Column<Invoice>[] = [
    { key: "number", header: "Invoice", cell: (inv) => inv.invoice_number },
    { key: "status", header: "Status", cell: statusPill },
    { key: "due", header: "Due", cell: (inv) => formatDate(inv.due_date), hideBelow: "md" },
    { key: "total", header: "Total", cell: total, align: "right" },
  ];

  const payButton = (inv: Invoice) =>
    inv.stripe_payment_url && inv.status !== "paid" ? (
      <Button size="sm" asChild className="min-h-[44px]">
        <a href={inv.stripe_payment_url} target="_blank" rel="noopener noreferrer">
          Pay now <ExternalLink className="ml-1 h-3 w-3" aria-hidden />
          <span className="sr-only"> invoice {inv.invoice_number} (opens in a new tab)</span>
        </a>
      </Button>
    ) : null;

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-4">
        <PageBar
          title="Invoices"
          subtitle={isLoading ? "Loading…" : unpaid.length ? `${unpaid.length} to pay · ${invoices.length} in total` : invoices.length ? `${plural(invoices.length, "invoice")}, all paid` : "Nothing yet"}
        />
        <ListControls
          filters={[
            { value: "all", label: "All" },
            { value: "unpaid", label: "To pay", count: unpaid.length },
            { value: "paid", label: "Paid" },
          ]}
          filter={filter}
          onFilterChange={setFilter}
        />
        <DataList
          rows={rows}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(inv) => inv.id}
          getRowHref={(inv) => `/invoices/${inv.id}`}
          actions={payButton}
          mobile={{
            title: (inv) => `${inv.invoice_number} · ${total(inv)}`,
            trailing: statusPill,
            meta: (inv) => (inv.due_date ? `Due ${formatDate(inv.due_date)}` : undefined),
          }}
          empty={
            filter === "all" ? (
              <EmptyState title="No invoices yet" description="Invoices from the workshop will show here once they're sent." />
            ) : (
              <EmptyState title={filter === "unpaid" ? "Nothing to pay" : "No paid invoices yet"} />
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
