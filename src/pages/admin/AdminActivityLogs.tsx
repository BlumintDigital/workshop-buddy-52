import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Activity, Search, ChevronLeft, ChevronRight, Filter } from "lucide-react";

type ActivityLog = {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  summary: string | null;
  details: Record<string, any>;
  created_at: string;
  user_name?: string;
};

const PAGE_SIZE = 25;

const tableLabels: Record<string, string> = {
  jobs: "Jobs",
  appointments: "Appointments",
  invoices: "Invoices",
  inventory_items: "Inventory",
  profiles: "Profiles",
  user_roles: "Roles",
  job_tasks: "Tasks",
};

const actionColors: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("all");
  const [filterAction, setFilterAction] = useState("all");

  // Cache profiles for user names
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  const fetchLogs = async () => {
    setLoading(true);

    let query = (supabase.from("activity_logs") as any)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterTable !== "all") query = query.eq("table_name", filterTable);
    if (filterAction !== "all") query = query.eq("action", filterAction);
    if (search) query = query.ilike("summary", `%${search}%`);

    const { data, count, error } = await query;
    if (error) { console.error(error); setLoading(false); return; }

    setLogs(data || []);
    setTotal(count || 0);

    // Fetch user names for any user_ids we haven't cached
    const userIds = [...new Set((data || []).map((l: any) => l.user_id).filter(Boolean))] as string[];
    const missing = userIds.filter((id) => !profileMap[id]);
    if (missing.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, company_name")
        .in("id", missing);
      if (profiles) {
        const newMap = { ...profileMap };
        profiles.forEach((p: any) => {
          newMap[p.id] = p.full_name || p.company_name || "Unknown";
        });
        setProfileMap(newMap);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterTable, filterAction]);

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 sm:h-7 sm:w-7" />
            Activity Logs
          </h2>
          <p className="text-muted-foreground">Monitor all changes across the platform</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search activity..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Select value={filterTable} onValueChange={(v) => { setFilterTable(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Table" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tables</SelectItem>
                  {Object.entries(tableLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(0); }}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} variant="secondary" className="sm:w-auto">
                <Search className="h-4 w-4 mr-2" />Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>{total} log entries found</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground py-8 text-center">Loading...</p>
            ) : logs.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">No activity logs yet. Changes to jobs, appointments, invoices, inventory, and users will appear here automatically.</p>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.user_id ? profileMap[log.user_id] || "—" : <span className="text-muted-foreground italic">System</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={actionColors[log.action] || ""}>
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {tableLabels[log.table_name] || log.table_name}
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate">
                            {log.summary || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {log.details && Object.keys(log.details).length > 0
                              ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(", ")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className={actionColors[log.action] || ""}>
                          {log.action}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm">{log.summary || "—"}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tableLabels[log.table_name] || log.table_name}</span>
                        <span>{log.user_id ? profileMap[log.user_id] || "—" : "System"}</span>
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                          {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-xs text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
