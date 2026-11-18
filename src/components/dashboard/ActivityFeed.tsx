import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Panel } from "./Panel";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";

type LogEntry = {
  id: string;
  action: string;
  table_name: string;
  summary: string | null;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = { created: "Created", updated: "Updated", deleted: "Deleted" };

const tableLabels: Record<string, string> = {
  jobs: "Projects",
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

  const fetchEntries = useCallback(async () => {
    const { data } = await supabase
      .from("activity_logs")
      .select("id, action, table_name, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    setEntries((data || []).filter((entry) => appointmentsEnabled || entry.table_name !== "appointments"));
    setLoading(false);
  }, [appointmentsEnabled]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  // activity_logs isn't in the realtime publication, so poll: once a minute, and only while visible.
  useVisibleInterval(() => void fetchEntries(), 60_000);

  return (
    <Panel title="Recent activity" description="The last five changes across the workshop" link={{ label: "View all", to: "/admin/activity-logs" }}>
      {loading ? (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">No activity yet. Changes to projects, invoices and stock show here.</p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="grid min-h-[56px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-5 py-2.5 sm:grid-cols-[6rem_minmax(0,1fr)_auto]">
              <span className="hidden text-sm text-muted-foreground sm:block">{tableLabels[e.table_name] || e.table_name}</span>
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                {e.summary ? <span className="text-muted-foreground"> · {e.summary}</span> : null}
              </span>
              <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
