import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";

type Report = {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  page_url: string | null;
  created_at: string;
  user_id: string | null;
  submitter_name: string;
};

const SEVERITY_TONE: Record<string, StatusTone> = { low: "neutral", medium: "warning", high: "danger" };
const STATUS_LABEL: Record<string, string> = { new: "New", reviewed: "Reviewed", resolved: "Resolved" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminFeedback() {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState("open");
  const { page, setPage, reset } = usePagination();

  const fetchReports = async (currentPage: number, currentFilter: string) => {
    setIsLoading(true);
    let query = (supabase.from("bug_reports" as any) as any)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (currentFilter === "open") query = query.in("status", ["new", "reviewed"]);
    else if (currentFilter !== "all") query = query.eq("status", currentFilter);
    const { data, count } = await query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    setTotalCount(count ?? 0);
    const rows = (data || []) as Omit<Report, "submitter_name">[];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
    const nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      (profiles || []).forEach((p: any) => {
        nameMap[p.id] = p.full_name || "Unknown";
      });
    }
    setReports(rows.map((r) => ({ ...r, submitter_name: (r.user_id && nameMap[r.user_id]) || "Unknown" })));
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReports(page, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filter]);

  const handleStatusChange = async (report: Report, status: string) => {
    const { error } = await (supabase.from("bug_reports" as any) as any).update({ status }).eq("id", report.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${report.title}" marked ${STATUS_LABEL[status].toLowerCase()}`);
    setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status } : r)));
  };

  const statusSelect = (r: Report) => (
    <Select value={r.status} onValueChange={(v) => handleStatusChange(r, v)}>
      <SelectTrigger className="h-9 w-32" aria-label={`Status of ${r.title}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const filters: FilterOption[] = [
    { value: "open", label: "Open" },
    { value: "new", label: "New" },
    { value: "resolved", label: "Resolved" },
    { value: "all", label: "All" },
  ];

  const columns: Column<Report>[] = [
    {
      key: "title",
      header: "Report",
      cell: (r) => (
        <span className="block max-w-md">
          <span className="block font-medium">{r.title}</span>
          {r.description && <span className="line-clamp-1 text-xs text-muted-foreground">{r.description}</span>}
        </span>
      ),
    },
    { key: "by", header: "From", cell: (r) => r.submitter_name, hideBelow: "md" },
    { key: "severity", header: "Severity", cell: (r) => <StatusPill tone={SEVERITY_TONE[r.severity] ?? "neutral"}><span className="capitalize">{r.severity}</span></StatusPill> },
    { key: "page", header: "Page", cell: (r) => <span className="block max-w-[200px] truncate text-xs text-muted-foreground">{r.page_url || "—"}</span>, hideBelow: "xl" },
    { key: "date", header: "Reported", cell: (r) => formatDate(r.created_at), hideBelow: "lg" },
  ];

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Issue reports"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? "report" : "reports"} · problems and feedback sent in from Report Issue`}
        />

        <ListControls filters={filters} filter={filter} onFilterChange={(v) => { setFilter(v); reset(); }} />

        <DataList
          rows={reports}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          mobile={{
            title: (r) => r.title,
            trailing: (r) => <StatusPill tone={SEVERITY_TONE[r.severity] ?? "neutral"}><span className="capitalize">{r.severity}</span></StatusPill>,
            meta: (r) => `${r.submitter_name} · ${formatDate(r.created_at)}`,
          }}
          actions={statusSelect}
          empty={
            filter === "open" ? (
              <EmptyState title="No open reports" description="Everything reported has been resolved." />
            ) : (
              <EmptyState title="No reports here" description="Reports appear when someone uses Report Issue in the Help menu." />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="reports" />
      </div>
    </DashboardLayout>
  );
}
