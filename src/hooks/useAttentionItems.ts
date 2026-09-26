import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import {
  countPendingInvites,
  countReviewJobs,
  fetchLowStockItems,
  fetchOverdueInvoices,
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

/**
 * Everything that needs someone's action right now, most severe first.
 * This is the single source for "needs attention" counts on the dashboards.
 */
export function useAttentionItems() {
  const { role, mfaEnabled, loading: authLoading } = useAuth();
  const { format, currency } = useCurrency();
  // `format` is recreated every render; read it through a ref and re-run on currency changes.
  const formatRef = useRef(format);
  formatRef.current = format;
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (authLoading || !role) return;
    let cancelled = false;
    setIsLoading(true);

    const run = async (currentRole: AppRole) => {
      const format = formatRef.current;
      const next: AttentionItem[] = [];
      const privileged = currentRole === "admin" || currentRole === "manager";
      const base = `/${currentRole}`;

      if (privileged) {
        const [overdue, reviewCount, lowStock, staleQuotes, invites] = await Promise.all([
          fetchOverdueInvoices().catch((): OverdueInvoice[] => []),
          countReviewJobs().catch(() => 0),
          fetchLowStockItems().catch((): LowStockItem[] => []),
          fetchStaleQuotes().catch((): StaleQuote[] => []),
          currentRole === "admin" ? countPendingInvites().catch(() => 0) : Promise.resolve(0),
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
            action: { label: "View inventory", to: `${base}/inventory` },
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
            action: { label: "View requests", to: `${base}/requests` },
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
      if (!cancelled) {
        setItems(next);
        setIsLoading(false);
      }
    };

    run(role);
    return () => {
      cancelled = true;
    };
  }, [role, mfaEnabled, authLoading, currency, refreshKey]);

  return { items, isLoading, refresh };
}
