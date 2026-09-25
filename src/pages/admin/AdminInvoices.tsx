import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { useCurrency } from "@/hooks/useCurrency";
import { overdueInvoiceFilter, todayIso } from "@/lib/dashboardQueries";

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_id: string | null;
  status: string;
  total: number;
  currency: string | null;
  due_date: string | null;
  created_at: string;
};

const STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled" };

/** Sent invoices past their due date count as overdue, matching the dashboard. */
function displayStatus(inv: Invoice): { label: string; tone: StatusTone } {
  if (inv.status === "overdue" || (inv.status === "sent" && inv.due_date && inv.due_date < todayIso())) {
    return { label: "Overdue", tone: "danger" };
  }
  const tone: Record<string, StatusTone> = { draft: "neutral", sent: "info", paid: "success", cancelled: "neutral" };
  return { label: STATUS_LABEL[inv.status] ?? inv.status, tone: tone[inv.status] ?? "neutral" };
}


export default function AdminInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const { page, setPage, reset } = usePagination();
  const { role } = useAuth();
  const { format: fmt } = useCurrency();

  const fetchInvoices = async (currentPage: number, currentFilter: string, currentSearch: string) => {
    setIsLoading(true);
    let query = supabase.from("invoices").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (currentFilter === "overdue") query = query.or(overdueInvoiceFilter());
    else if (currentFilter !== "all") query = query.eq("status", currentFilter);
    if (currentSearch.trim()) query = query.ilike("invoice_number", `%${currentSearch.trim()}%`);
    const { data, count, error } = await query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) toast.error("Couldn't load invoices. Reload the page to try again.");
    setTotalCount(count ?? 0);
    const rows = (data || []) as Invoice[];
    const clientIds = [...new Set(rows.map((i) => i.client_id).filter(Boolean))] as string[];
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, company_name").in("id", clientIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        map[p.id] = p.company_name || p.full_name || "Unknown";
      });
      setClientNames(map);
    }
    setInvoices(rows);
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
    fetchInvoices(page, filter, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter, debouncedSearch]);

  const refresh = () => fetchInvoices(page, filter, debouncedSearch);

  const handleDelete = async (inv: Invoice) => {
    await supabase.from("invoice_items").delete().eq("invoice_id", inv.id);
    const { error } = await supabase.from("invoices").delete().eq("id", inv.id);
    setDeleting(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted ${inv.invoice_number ?? "invoice"}`);
    refresh();
  };

  const handleStatusChange = async (inv: Invoice, status: string) => {
    const update: { status: string; paid_at?: string } = { status };
    if (status === "paid") update.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(update).eq("id", inv.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${inv.invoice_number ?? "Invoice"} marked as ${STATUS_LABEL[status].toLowerCase()}`);
    refresh();
  };

  const filters: FilterOption[] = [
    { value: "all", label: "All" },
    { value: "draft", label: "Drafts" },
    { value: "sent", label: "Sent" },
    { value: "overdue", label: "Overdue" },
    { value: "paid", label: "Paid" },
  ];

  const columns: Column<Invoice>[] = [
    { key: "number", header: "Invoice", cell: (inv) => inv.invoice_number || "Draft" },
    { key: "client", header: "Client", cell: (inv) => (inv.client_id ? clientNames[inv.client_id] ?? "—" : "—"), hideBelow: "md" },
    {
      key: "status",
      header: "Status",
      cell: (inv) => {
        const s = displayStatus(inv);
        return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
      },
    },
    { key: "total", header: "Total", cell: (inv) => fmt(Number(inv.total), inv.currency || undefined), align: "right" },
    { key: "due", header: "Due", cell: (inv) => formatDate(inv.due_date), hideBelow: "md" },
    { key: "created", header: "Created", cell: (inv) => formatDate(inv.created_at), hideBelow: "lg" },
  ];

  const hasQuery = filter !== "all" || debouncedSearch.trim() !== "";

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Invoices"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? "invoice" : "invoices"}`}
          actions={
            <Button asChild>
              <Link to="/invoices/new">
                <Plus />
                New invoice
              </Link>
            </Button>
          }
        />

        <ListControls
          filters={filters}
          filter={filter}
          onFilterChange={(v) => {
            setFilter(v);
            reset();
          }}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by invoice number"
        />

        <DataList
          rows={invoices}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(inv) => inv.id}
          getRowHref={(inv) => `/invoices/${inv.id}`}
          mobile={{
            title: (inv) => (
              <>
                {inv.invoice_number || "Draft"} · <span className="tabular-nums">{fmt(Number(inv.total), inv.currency || undefined)}</span>
              </>
            ),
            trailing: (inv) => {
              const s = displayStatus(inv);
              return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
            },
            meta: (inv) =>
              [inv.client_id && clientNames[inv.client_id], inv.due_date && `Due ${formatDate(inv.due_date)}`].filter(Boolean).join(" · "),
          }}
          actions={(inv) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${inv.invoice_number ?? "invoice"}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Mark as</DropdownMenuLabel>
                {STATUSES.filter((s) => s !== inv.status).map((s) => (
                  <DropdownMenuItem key={s} className="min-h-[40px]" onClick={() => handleStatusChange(inv, s)}>
                    {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
                {role === "admin" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="min-h-[40px] text-destructive focus:text-destructive" onClick={() => setDeleting(inv)}>
                      Delete invoice
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          empty={
            hasQuery ? (
              <EmptyState title="No invoices match" description="Try another filter or clear the search." />
            ) : (
              <EmptyState
                title="No invoices yet"
                description="Create one from scratch, or from a completed job."
                action={
                  <Button asChild>
                    <Link to="/invoices/new">
                      <Plus />
                      New invoice
                    </Link>
                  </Button>
                }
              />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="invoices" />
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.invoice_number ?? "this invoice"}?</AlertDialogTitle>
            <AlertDialogDescription>The invoice and its line items are removed permanently. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep invoice</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && handleDelete(deleting)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
