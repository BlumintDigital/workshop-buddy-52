import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePendingRequestCount } from "@/hooks/usePendingRequestCount";
import { countReviewJobs, fetchLowStockItems, fetchOverdueInvoices } from "@/lib/dashboardQueries";

/** Keys a nav item can show a live count for. */
export type NavCountKey = "requests" | "reviewJobs" | "overdueInvoices" | "lowStock" | "quotesToDecide" | "myOpenJobs";

export type NavCounts = Partial<Record<NavCountKey, number>>;

/** Loads the counts; used once by NavCountsProvider. */
function useLoadNavCounts(): NavCounts {
  const { user, role } = useAuth();
  const pendingRequests = usePendingRequestCount();
  const [counts, setCounts] = useState<NavCounts>({});

  useEffect(() => {
    if (!user || !role) return;
    let cancelled = false;

    const load = async () => {
      const next: NavCounts = {};
      if (role === "admin" || role === "manager") {
        const [review, overdue, lowStock] = await Promise.all([
          countReviewJobs().catch(() => 0),
          fetchOverdueInvoices().then((r) => r.length).catch(() => 0),
          fetchLowStockItems().then((r) => r.length).catch(() => 0),
        ]);
        Object.assign(next, { reviewJobs: review, overdueInvoices: overdue, lowStock });
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
      if (!cancelled) setCounts(next);
    };

    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, role]);

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
