import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { EmptyState } from "@/components/list/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Invoice pages for staff: open to anyone given the Billing permission (admins,
 * managers and clients reach them through their roles as before).
 */
export function BillingGate({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { has, loading } = usePermissions();
  if (role !== "staff") return <>{children}</>;
  if (loading) {
    return (
      <DashboardLayout>
        <Skeleton className="h-40 w-full rounded-lg" />
      </DashboardLayout>
    );
  }
  if (!has("billing")) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl space-y-4">
          <PageBar title="Invoices" />
          <div className="rounded-lg border bg-card px-4 py-10 text-center">
            <EmptyState title="You don't have billing access" description="Ask an admin to give you Billing in Teams and access." />
          </div>
        </div>
      </DashboardLayout>
    );
  }
  return <>{children}</>;
}
