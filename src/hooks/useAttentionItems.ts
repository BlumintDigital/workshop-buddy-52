import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { DASHBOARD_KEY, DASHBOARD_STALE_MS, useSharedDashboardFetchers } from "@/hooks/useDashboardQueries";
import {
  countPendingInvites,
  fetchDraftInvoices,
  fetchUninvoicedProjects,
  type DraftInvoice,
  type UninvoicedProject,
  fetchStaleQuotes,
  todayIso,
  type LowStockItem,
  type OverdueInvoice,
  type StaleQuote,
} from "@/lib/dashboardQueries";

export type AttentionSeverity = "danger" | "warning" | "info";

export type AttentionItem = {
  id: string;
  severity: AttentionSeverity;
  title: string;
  meta?: string;
  /** Short state label shown as a pill, e.g. "Overdue". */
  label: string;
  action: { label: string; to: string };
};

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { danger: 0, warning: 1, info: 2 };

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000));
}

function listPreview(values: string[], max = 3): string {
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} and ${values.length - max} more`;
}

type SharedFetchers = ReturnType<typeof useSharedDashboardFetchers>;

/**
 * Everything that needs someone's action right now, most severe first.
 * This is the single source for "needs attention" counts on the dashboards. Cached per user for
 * 30 seconds; overdue invoices, review and low stock are shared with the Today cards and nav badges.
 */
export function useAttentionItems() {
  const { user, role, mfaEnabled, loading: authLoading } = useAuth();
  const { format, currency } = useCurrency();
  const queryClient = useQueryClient();
  const shared = useSharedDashboardFetchers();

  const query = useQuery({
    queryKey: [DASHBOARD_KEY, user?.id ?? "signed-out", "attention", role, mfaEnabled, currency],
    queryFn: () => buildAttentionItems(role as AppRole, mfaEnabled, format, shared),
    enabled: !authLoading && !!role,
    staleTime: DASHBOARD_STALE_MS,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [DASHBOARD_KEY] });
  }, [queryClient]);

  return { items: query.data ?? [], isLoading: query.isLoading || (!query.data && authLoading), refresh };
}

async function buildAttentionItems(
  currentRole: AppRole,
  mfaEnabled: boolean,
  format: (n: number) => string,
  shared: SharedFetchers,
): Promise<AttentionItem[]> {
  const next: AttentionItem[] = [];
  const privileged = currentRole === "admin" || currentRole === "manager";
  const base = `/${currentRole}`;

  if (privileged) {
    const [overdue, reviewCount, lowStock, staleQuotes, invites, drafts, uninvoiced] = await Promise.all([
      shared.overdueInvoices().catch((): OverdueInvoice[] => []),
      shared.reviewJobsCount().catch(() => 0),
      shared.lowStockItems().catch((): LowStockItem[] => []),
      fetchStaleQuotes().catch((): StaleQuote[] => []),
      currentRole === "admin" ? countPendingInvites().catch(() => 0) : Promise.resolve(0),
      fetchDraftInvoices().catch((): DraftInvoice[] => []),
      fetchUninvoicedProjects().catch((): UninvoicedProject[] => []),
    ]);

    if (overdue.length > 0) {
      const today = todayIso();
      const total = overdue.reduce((sum, i) => sum + i.amount, 0);
      next.push({
        id: "overdue-invoices",
        severity: "danger",
        label: "Overdue",
        title: `${overdue.length} ${overdue.length === 1 ? "invoice" : "invoices"} overdue · ${format(total)}`,
        meta: listPreview(
          overdue.map((i) =>
            i.due_date
              ? `${i.invoice_number ?? "Invoice"} (${daysBetween(i.due_date, today)} days)`
              : i.invoice_number ?? "Invoice",
          ),
        ),
        action: { label: "View invoices", to: `${base}/invoices` },
      });
    }

    if (uninvoiced.length > 0) {
      next.push({
        id: "uninvoiced-projects",
        severity: "warning",
        label: "To invoice",
        title: `${uninvoiced.length} finished ${uninvoiced.length === 1 ? "project has" : "projects have"} no invoice`,
        meta: listPreview(uninvoiced.map((p) => (p.ref ? `${p.ref} ${p.title}` : p.title) + (p.client_id ? "" : " (walk-in, bill outside the portal)"))),
        action: { label: "Open the first", to: `/projects/${uninvoiced[0].id}` },
      });
    }

    if (drafts.length > 0) {
      next.push({
        id: "draft-invoices",
        severity: "info",
        label: "Drafts",
        title: `${drafts.length} draft ${drafts.length === 1 ? "invoice" : "invoices"} to send · ${format(drafts.reduce((s, d) => s + d.total, 0))}`,
        meta: listPreview(drafts.map((d) => d.invoice_number)),
        action: { label: "View invoices", to: `${base}/invoices?status=draft` },
      });
    }

    if (reviewCount > 0) {
      next.push({
        id: "review-jobs",
        severity: "warning",
        label: "Review",
        title: `${reviewCount} ${reviewCount === 1 ? "project" : "projects"} waiting for quality check`,
        meta: "Every task is done. Check the work and send it on to shipping.",
        action: { label: "Open projects", to: `${base}/projects?status=review` },
      });
    }

    if (lowStock.length > 0) {
      next.push({
        id: "low-stock",
        severity: "warning",
        label: "Low stock",
        title: `${lowStock.length} ${lowStock.length === 1 ? "item" : "items"} at or below reorder level`,
        meta: listPreview(lowStock.map((i) => `${i.name} (${i.quantity}${i.unit ? ` ${i.unit}` : ""} left)`)),
        action: { label: "View stock", to: "/inventory/stock" },
      });
    }

    if (staleQuotes.length > 0) {
      const oldest = staleQuotes[0];
      next.push({
        id: "stale-quotes",
        severity: "info",
        label: "Quote sent",
        title: `${staleQuotes.length} ${staleQuotes.length === 1 ? "quote" : "quotes"} waiting on the client`,
        meta: `Oldest: ${oldest.title}${oldest.quoted_total != null ? ` · ${format(oldest.quoted_total)}` : ""} · ${oldest.days} days`,
        action: { label: "View projects", to: `${base}/projects?status=quote` },
      });
    }

    if (invites > 0) {
      next.push({
        id: "pending-invites",
        severity: "info",
        label: "Invites",
        title: `${invites} ${invites === 1 ? "invite" : "invites"} not accepted yet`,
        meta: "Resend from Users if someone missed the email",
        action: { label: "View users", to: "/admin/users" },
      });
    }

    if (!mfaEnabled) {
      next.push({
        id: "enable-2fa",
        severity: "warning",
        label: "Account",
        title: "Turn on two-factor sign-in",
        meta: "Required for admins and managers. Takes about 2 minutes",
        action: { label: "Set up 2FA", to: "/profile" },
      });
    }
  }

  next.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return next;
}
