import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";
import { useFeature } from "@/hooks/useFeatureFlags";

type LogEntry = {
  id: string;
  action: string;
  table_name: string;
  summary: string | null;
  created_at: string;
};

const actionColors: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const tableLabels: Record<string, string> = {
  jobs: "Jobs",
  appointments: "Appointments",
  invoices: "Invoices",
  inventory_items: "Inventory",
  profiles: "Profiles",
  user_roles: "Roles",
  job_tasks: "Tasks",
};

export function ActivityFeed() {
  const appointmentsEnabled = useFeature("appointments");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      const { data } = await supabase
        .from("activity_logs")
        .select("id, action, table_name, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (!active) return;
      setEntries((data || []).filter((entry) => appointmentsEnabled || entry.table_name !== "appointments"));
      setLoading(false);
    };
    fetch();
    const interval = setInterval(fetch, 15000);
    const onFocus = () => fetch();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [appointmentsEnabled]);

  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Live Activity Feed
        </CardTitle>
        <CardDescription>Real-time platform changes</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex min-w-0 items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No activity yet</p>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.id} className="flex min-w-0 items-start gap-3">
                <Badge variant="secondary" className={`shrink-0 text-[10px] ${actionColors[e.action] || ""}`}>
                  {e.action}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{e.summary || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {tableLabels[e.table_name] || e.table_name} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link to="/admin/activity-logs" className="block text-sm text-primary hover:underline text-center mt-4">
          View all activity →
        </Link>
      </CardContent>
    </Card>
  );
}
