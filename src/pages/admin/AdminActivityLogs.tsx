import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { AlertTriangle, X } from "lucide-react";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";
import { cn } from "@/lib/utils";

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
  jobs: "Projects",
  appointments: "Appointments",
  invoices: "Invoices",
  inventory_items: "Inventory",
  profiles: "Profiles",
  user_roles: "Roles",
  job_tasks: "Tasks",
};

const ACTION_TONE: Record<string, StatusTone> = {
  created: "success",
  updated: "info",
  deleted: "danger",
};

type AnomalyAlert = {
  id: string;
  message: string;
  severity: "high" | "medium";
};

export default function AdminActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filterTable, setFilterTable] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [dismissedAnomalies, setDismissedAnomalies] = useState<Set<string>>(new Set());

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

  const fetchAnomalies = async () => {
    const alerts: AnomalyAlert[] = [];
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

    // Role escalations in last 24h
    const { data: roleChanges } = await (supabase.from("activity_logs") as any)
      .select("id, user_id, created_at, summary")
      .eq("action", "updated")
      .eq("table_name", "user_roles")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(20);
    if (roleChanges?.length > 0) {
      alerts.push({
        id: "role-escalation",
        severity: "high",
        message: `${roleChanges.length} role change${roleChanges.length > 1 ? "s" : ""} detected in the last 24 hours — review for unauthorized privilege escalation.`,
      });
    }

    // Bulk deletes: any user deleting > 5 records in 24h
    const { data: deleteRows } = await (supabase.from("activity_logs") as any)
      .select("user_id")
      .eq("action", "deleted")
      .gte("created_at", since24h);
    if (deleteRows) {
      const countByUser: Record<string, number> = {};
      (deleteRows as any[]).forEach((r: any) => {
        if (r.user_id) countByUser[r.user_id] = (countByUser[r.user_id] ?? 0) + 1;
      });
      const highDeleters = Object.entries(countByUser).filter(([, n]) => n > 5);
      if (highDeleters.length > 0) {
        alerts.push({
          id: "bulk-delete",
          severity: "high",
          message: `${highDeleters.length} user${highDeleters.length > 1 ? "s have" : " has"} deleted more than 5 records in the last 24 hours — review for data loss.`,
        });
      }
    }

    // Feature flag changes in last 7 days
    const { data: flagChanges } = await (supabase.from("activity_logs") as any)
      .select("id, created_at, summary")
      .eq("table_name", "feature_flags")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(20);
    if (flagChanges?.length > 0) {
      alerts.push({
        id: "feature-flag-change",
        severity: "medium",
        message: `${flagChanges.length} feature flag change${flagChanges.length > 1 ? "s" : ""} in the last 7 days.`,
      });
    }

    setAnomalies(alerts);
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterTable, filterAction]);

  useEffect(() => {
    fetchAnomalies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh logs every 20s while the tab is visible, and straight away when it comes back.
  useVisibleInterval(() => { fetchLogs(); }, 20_000);

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  // Search as you type (debounced) instead of needing Enter or a Search button.
  useEffect(() => {
    const timer = setTimeout(() => handleSearch(), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const actionFilters: FilterOption[] = [
    { value: "all", label: "All changes" },
    { value: "created", label: "Created" },
    { value: "updated", label: "Updated" },
    { value: "deleted", label: "Deleted" },
  ];

  const who = (log: ActivityLog) => (log.user_id ? profileMap[log.user_id] || "Unknown user" : "System");
  const details = (log: ActivityLog) =>
    log.details && Object.keys(log.details).length > 0
      ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(", ")
      : "";
  const actionPill = (log: ActivityLog) => (
    <StatusPill tone={ACTION_TONE[log.action] ?? "neutral"}>
      <span className="capitalize">{log.action}</span>
    </StatusPill>
  );

  const columns: Column<ActivityLog>[] = [
    { key: "time", header: "When", cell: (log) => <span className="whitespace-nowrap tabular-nums text-muted-foreground">{format(new Date(log.created_at), "d MMM, HH:mm:ss")}</span> },
    { key: "user", header: "Who", cell: who, hideBelow: "md" },
    { key: "action", header: "Change", cell: actionPill },
    { key: "table", header: "Area", cell: (log) => tableLabels[log.table_name] || log.table_name, hideBelow: "md" },
    { key: "summary", header: "Summary", cell: (log) => <span className="block max-w-sm truncate">{log.summary || "—"}</span> },
    { key: "details", header: "Details", cell: (log) => <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{details(log) || "—"}</span>, hideBelow: "xl" },
  ];

  const visibleAnomalies = anomalies.filter((a) => !dismissedAnomalies.has(a.id));

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar title="Activity log" subtitle={loading ? "Loading…" : `${total} changes recorded · updates every 20 seconds`} />

        {visibleAnomalies.length > 0 && (
          <ul className="space-y-2" aria-label="Unusual activity">
            {visibleAnomalies.map((alert) => (
              <li
                key={alert.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-4 py-3",
                  alert.severity === "high" ? "border-destructive/40 bg-destructive-soft" : "border-warning/40 bg-warning-soft",
                )}
              >
                <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", alert.severity === "high" ? "text-destructive" : "text-warning")} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold">{alert.severity === "high" ? "Security alert" : "Worth a look"}</p>
                  <p className="text-foreground">{alert.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDismissedAnomalies((prev) => new Set([...prev, alert.id]))}
                  className="h-9 w-9 shrink-0"
                  aria-label="Dismiss alert"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <ListControls
          filters={actionFilters}
          filter={filterAction}
          onFilterChange={(v) => { setFilterAction(v); setPage(0); }}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search summaries"
        >
          <Select value={filterTable} onValueChange={(v) => { setFilterTable(v); setPage(0); }}>
            <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Area">
              <SelectValue placeholder="All areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {Object.entries(tableLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ListControls>

        <DataList
          rows={logs}
          columns={columns}
          isLoading={loading && logs.length === 0}
          getRowKey={(log) => log.id}
          mobile={{
            title: (log) => log.summary || "—",
            trailing: actionPill,
            meta: (log) => `${format(new Date(log.created_at), "d MMM, HH:mm")} · ${tableLabels[log.table_name] || log.table_name} · ${who(log)}`,
          }}
          empty={
            <EmptyState
              title={search || filterTable !== "all" || filterAction !== "all" ? "No changes match" : "No activity yet"}
              description={
                search || filterTable !== "all" || filterAction !== "all"
                  ? "Try another filter or search."
                  : "Changes to projects, appointments, invoices, inventory and users are recorded here automatically."
              }
            />
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} noun="changes" />
      </div>
    </DashboardLayout>
  );
}
