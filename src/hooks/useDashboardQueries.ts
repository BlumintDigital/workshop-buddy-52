import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import {
  countReviewJobs,
  fetchDashboardSnapshot,
  fetchLowStockItems,
  fetchOverdueInvoices,
  type DashboardSnapshot,
} from "@/lib/dashboardQueries";

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
 * 30 seconds; concurrent callers share the request that's already in flight. On the Today page
 * the dashboard snapshot fills these caches, so the badges don't fetch separately there.
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

/**
 * The Today dashboard's data in one `dashboard_today` call, shared by the Today cards and the
 * attention queue (they ask for the same key, so it's one request). Also seeds the badge caches.
 */
export function useDashboardSnapshotFetcher() {
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const appointments = useFeature("appointments");
  const uid = user?.id ?? "signed-out";
  const invites = role === "admin";

  return useMemo(
    () => (): Promise<DashboardSnapshot> =>
      queryClient.fetchQuery({
        queryKey: [DASHBOARD_KEY, uid, "snapshot", appointments, invites],
        queryFn: async () => {
          const snapshot = await fetchDashboardSnapshot({ appointments, invites });
          queryClient.setQueryData([DASHBOARD_KEY, uid, "overdue-invoices"], snapshot.overdueInvoices);
          queryClient.setQueryData([DASHBOARD_KEY, uid, "review-jobs"], snapshot.reviewCount);
          queryClient.setQueryData([DASHBOARD_KEY, uid, "low-stock"], snapshot.lowStock);
          return snapshot;
        },
        staleTime: DASHBOARD_STALE_MS,
      }),
    [queryClient, uid, appointments, invites],
  );
}
