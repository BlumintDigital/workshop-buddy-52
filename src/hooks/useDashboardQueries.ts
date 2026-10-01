import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { countReviewJobs, fetchLowStockItems, fetchOverdueInvoices } from "@/lib/dashboardQueries";

/**
 * How long dashboard figures are reused before they are fetched again. Long enough that the Today
 * cards, the attention queue and the sidebar badges share one request; short enough that a change
 * made on another page shows up when you come back.
 */
export const DASHBOARD_STALE_MS = 30_000;

/** Root of every cached dashboard query, so Refresh can invalidate them all at once. */
export const DASHBOARD_KEY = "dashboard";

/**
 * Overdue invoices, projects waiting for review and low stock are read by the Today cards, the
 * attention queue and the nav badges. These cached fetchers make them one request per user per
 * 30 seconds; concurrent callers share the request that's already in flight.
 */
export function useSharedDashboardFetchers() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id ?? "signed-out";

  return useMemo(
    () => ({
      overdueInvoices: () =>
        queryClient.fetchQuery({
          queryKey: [DASHBOARD_KEY, uid, "overdue-invoices"],
          queryFn: fetchOverdueInvoices,
          staleTime: DASHBOARD_STALE_MS,
        }),
      reviewJobsCount: () =>
        queryClient.fetchQuery({
          queryKey: [DASHBOARD_KEY, uid, "review-jobs"],
          queryFn: countReviewJobs,
          staleTime: DASHBOARD_STALE_MS,
        }),
      lowStockItems: () =>
        queryClient.fetchQuery({
          queryKey: [DASHBOARD_KEY, uid, "low-stock"],
          queryFn: fetchLowStockItems,
          staleTime: DASHBOARD_STALE_MS,
        }),
    }),
    [queryClient, uid],
  );
}
