import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { DASHBOARD_KEY, DASHBOARD_STALE_MS, useDashboardSnapshotFetcher } from "@/hooks/useDashboardQueries";
import { fetchDueReminders } from "@/hooks/useAssets";
import { todayIso } from "@/lib/dashboardQueries";
import { buildTodoItems, listPreview, plural, sortTodo, type TodoItem } from "@/lib/dashboardTodo";
import { useIndustry } from "@/lib/industry";

export type { TodoItem } from "@/lib/dashboardTodo";

/**
 * The Today "To do" summary: one line per kind of work waiting, each with an exact count from the
 * server and a link to the filtered list. Shares the cached dashboard_today call with the Today
 * cards. A failed load is an error, never an empty list that looks like "nothing to do".
 */
export function useAttentionItems() {
  const { user, role, mfaEnabled, loading: authLoading } = useAuth();
  const { format, currency } = useCurrency();
  const { has, loading: permissionsLoading } = usePermissions();
  const { asset } = useIndustry();
  const queryClient = useQueryClient();
  const fetchSnapshot = useDashboardSnapshotFetcher();
  const canSeeMoney = has("billing");
  const canSeeCosts = has("reports");

  const query = useQuery({
    queryKey: [DASHBOARD_KEY, user?.id ?? "signed-out", "attention", role, mfaEnabled, currency, canSeeMoney, canSeeCosts, asset.plural],
    queryFn: async (): Promise<TodoItem[]> => {
      if (role !== "admin" && role !== "manager") return [];
      const snapshot = await fetchSnapshot();
      const items = buildTodoItems(snapshot, { role, mfaEnabled, canSeeMoney, canSeeCosts, format, today: todayIso() });
      // Services coming due on customers' assets (nothing when the asset register is off).
      const due = await fetchDueReminders().catch((): Awaited<ReturnType<typeof fetchDueReminders>> => []);
      if (due.length > 0) {
        const overdue = due.filter((d) => d.overdue).length;
        items.push({
          id: "assets-due",
          severity: overdue ? "warning" : "info",
          label: overdue ? "Service overdue" : "Service due",
          count: due.length,
          title: `${plural(due.length, "Service", "Services")} due on ${due.length === 1 ? `a customer's ${asset.singular}` : `customers' ${asset.plural}`}`,
          meta: listPreview(due.map((d) => `${d.title}: ${d.asset}`)),
          to: "/assets?filter=due",
        });
      }
      return sortTodo(items);
    },
    enabled: !authLoading && !!role && !permissionsLoading,
    staleTime: DASHBOARD_STALE_MS,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [DASHBOARD_KEY] });
  }, [queryClient]);

  return {
    items: query.data ?? [],
    isLoading: !query.data && !query.isError,
    isError: query.isError && !query.data,
    refresh,
  };
}
