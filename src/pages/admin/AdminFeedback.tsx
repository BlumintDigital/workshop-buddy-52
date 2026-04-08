import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

const severityColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  new: "secondary",
  reviewed: "outline",
  resolved: "default",
};

export default function AdminFeedback() {
  const [reports, setReports] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const { page, setPage } = usePagination();

  const fetchReports = async (currentPage = page) => {
    const { data, count } = await supabase
      .from("bug_reports")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    setTotalCount(count ?? 0);
    if (!data) { setReports([]); return; }

    // Fetch submitter names
    const userIds = [...new Set(data.map((r: any) => r.user_id).filter(Boolean))];
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      if (profiles) profiles.forEach((p: any) => { nameMap[p.id] = p.full_name || "Unknown"; });
    }

    setReports(data.map((r: any) => ({ ...r, submitter_name: nameMap[r.user_id] || "Unknown" })));
  };

  useEffect(() => { fetchReports(page); }, [page]);

  const handleStatusChange = async (id: string, status: string) => {
    const { error } = await supabase.from("bug_reports").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Issue Reports</h2>
            <p className="text-muted-foreground">Bug reports and feedback submitted by users</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Page</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No reports submitted yet
                    </TableCell>
                  </TableRow>
                ) : reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{r.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{r.description}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.submitter_name}</TableCell>
                    <TableCell>
                      <Badge variant={severityColors[r.severity] || "outline"} className="capitalize">
                        {r.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select value={r.status} onValueChange={(v) => handleStatusChange(r.id, v)}>
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue>
                            <Badge variant={statusColors[r.status] || "outline"} className="capitalize">
                              {r.status}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="reviewed">Reviewed</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                      {r.page_url || "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => setPage(p => Math.max(0, p - 1))} aria-disabled={page === 0} className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-3 py-1 text-sm">Page {page + 1} of {totalPages}</span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} aria-disabled={page >= totalPages - 1} className={page >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
