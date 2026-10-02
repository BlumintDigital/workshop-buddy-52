import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/list/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetList } from "@/hooks/useAssets";
import { assetSummary, useIndustry } from "@/lib/industry";
import { REMINDER_STATE_LABEL, REMINDER_STATE_TONE, describeDue, reminderState } from "@/lib/assets";

/** A client's own machines, vehicles or equipment, with what's due for service. */
export default function ClientAssets() {
  const profile = useIndustry();
  const { data: rows = [], isLoading } = useAssetList();

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title={`Your ${profile.asset.plural}`}
          subtitle={`Service history and what's coming due. Open one to see every job on it, or to book a service.`}
        />
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState title={`No ${profile.asset.plural} yet`} description={`When the workshop works on one of your ${profile.asset.plural}, it's added here with its service history.`} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((a) => {
              const next = a.reminders
                .map((r) => ({ r, s: reminderState(r, a.meter_reading) }))
                .sort((x, y) => (x.r.due_date ?? "9999").localeCompare(y.r.due_date ?? "9999"))[0];
              return (
                <li key={a.id}>
                  <Link to={`/assets/${a.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-secondary/60">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{assetSummary(a)}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {next ? `${next.r.title}: ${describeDue(next.r, a.meter_unit).replace(/^Due /, "due ")}` : "No services scheduled"}
                      </p>
                    </div>
                    {next && next.s !== "ok" && <StatusPill tone={REMINDER_STATE_TONE[next.s]}>{REMINDER_STATE_LABEL[next.s]}</StatusPill>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
