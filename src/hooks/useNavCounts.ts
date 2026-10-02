import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePendingRequestCount } from "@/hooks/usePendingRequestCount";
import { useSharedDashboardFetchers } from "@/hooks/useDashboardQueries";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import { fetchDueReminders } from "@/hooks/useAssets";

/** Keys a nav item can show a live count for. */
export type NavCountKey = "requests" | "reviewJobs" | "overdueInvoices" | "lowStock" | "quotesToDecide" | "myOpenJobs" | "toShip" | "assetsDue";

export type NavCounts = Partial<Record<NavCountKey, number>>;

/** Loads the counts; used once by NavCountsProvider. */
function useLoadNavCounts(): NavCounts {
  const { user, role } = useAuth();
  const pendingRequests = usePendingRequestCount();
  const shared = useSharedDashboardFetchers();
  const [counts, setCounts] = useState<NavCounts>({});

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!user || !role) return;
    const next: NavCounts = {};
    if (role === "admin" || role === "manager") {
      // Shared with the Today cards and the attention queue, so these don't add requests there.
      const [review, overdue, lowStock] = await Promise.all([
        shared.reviewJobsCount().catch(() => 0),
        shared.overdueInvoices().then((r) => r.length).catch(() => 0),
        shared.lowStockItems().then((r) => r.length).catch(() => 0),
      ]);
      Object.assign(next, { reviewJobs: review, overdueInvoices: overdue, lowStock });
      // Services due soon or overdue (none when the asset register is off: the table refuses reads).
      next.assetsDue = await fetchDueReminders().then((r) => r.length).catch(() => 0);
    } else if (role === "staff") {
      // Open tasks assigned to me (the work, not the projects).
      const { count } = await supabase
        .from("job_tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", user.id)
        .neq("status", "completed");
      next.myOpenJobs = count || 0;
    } else if (role === "client") {
      // Quotes and change requests waiting for this client (RLS limits it to their projects).
      const { count } = await supabase.from("project_quotes").select("id", { count: "exact", head: true }).eq("status", "sent");
      next.quotesToDecide = count || 0;
    }
    if (role !== "client") {
      // Shipments that need shipping's next move (RLS limits this to people who can see them).
      const { count } = await supabase.from("shipments").select("id", { count: "exact", head: true }).in("status", ["ready", "scheduled"]);
      next.toShip = count || 0;
    }
    if (!isCancelled()) setCounts(next);
  }, [user, role, shared]);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Badges refresh once a minute while the tab is visible.
  useVisibleInterval(() => void load(), 60_000, !!user && !!role);

  return { ...counts, requests: pendingRequests };
}

const NavCountsContext = createContext<NavCounts>({});

/** Fetches the badge counts once for the whole app shell (sidebar and tab bar share them). */
export function NavCountsProvider({ children }: { children: ReactNode }) {
  const counts = useLoadNavCounts();
  return createElement(NavCountsContext.Provider, { value: counts }, children);
}

/** Counts that need attention, refreshed every minute. Shown as badges in the sidebar and tab bar. */
export function useNavCounts(): NavCounts {
  return useContext(NavCountsContext);
}
