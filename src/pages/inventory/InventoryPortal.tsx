import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import RequestsSection from "@/components/inventory/RequestsSection";
import StockSection from "@/components/inventory/StockSection";
import PurchasesSection from "@/components/inventory/PurchasesSection";
import SuppliersSection, { type SupplierRow } from "@/components/inventory/SuppliersSection";
import UsageSection from "@/components/inventory/UsageSection";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The inventory portal: parts requests from projects, stock, purchase orders,
 * suppliers and usage per project. Stores sees everything; approvers see
 * purchases; the rest of the team can look up stock.
 */
export default function InventoryPortal() {
  const { has, loading } = usePermissions();
  const stores = has("inventory");
  const approver = has("inventory_approve");
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [counts, setCounts] = useState({ requests: 0, approvals: 0 });

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("id, name, contact_name, email, phone, address, notes").order("name");
    setSuppliers((data ?? []) as SupplierRow[]);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (stores || approver) void loadSuppliers();
    void (async () => {
      const [r, a] = await Promise.all([
        stores ? supabase.from("stock_requests").select("id", { count: "exact", head: true }).in("status", ["open", "partial"]) : Promise.resolve({ count: 0 }),
        approver ? supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("status", "pending_approval") : Promise.resolve({ count: 0 }),
      ]);
      setCounts({ requests: r.count ?? 0, approvals: a.count ?? 0 });
    })();
  }, [loading, stores, approver, loadSuppliers]);

  const sections = [
    stores && { to: "/inventory", label: "Parts requests", count: counts.requests, end: true },
    { to: "/inventory/stock", label: "Stock" },
    (stores || approver) && { to: "/inventory/purchases", label: "Purchases", count: counts.approvals },
    stores && { to: "/inventory/suppliers", label: "Suppliers" },
    stores && { to: "/inventory/usage", label: "Usage by project" },
  ].filter(Boolean) as { to: string; label: string; count?: number; end?: boolean }[];

  const subtitle = stores
    ? "Issue parts to projects, keep stock topped up and buy what's missing."
    : approver
      ? "Approve purchase orders and look up stock."
      : "See what's on the shelf. Ask for parts from the project page.";

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-6xl space-y-4">
        <PageBar title="Inventory" subtitle={subtitle} />
        <nav aria-label="Inventory sections" className="-mx-3 flex gap-1 overflow-x-auto border-b px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                cn(
                  "-mb-px inline-flex min-h-[44px] shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors",
                  isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              {s.label}
              {!!s.count && <span className="rounded-full bg-warning-soft px-1.5 text-xs tabular-nums text-warning">{s.count}</span>}
            </NavLink>
          ))}
        </nav>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Routes>
            <Route index element={stores ? <RequestsSection canManage suppliers={suppliers} /> : <Navigate to={approver ? "purchases" : "stock"} replace />} />
            <Route path="stock" element={<StockSection canManage={stores} suppliers={suppliers} />} />
            <Route path="purchases" element={stores || approver ? <PurchasesSection canManage={stores} canApprove={approver} suppliers={suppliers} /> : <Navigate to="/inventory/stock" replace />} />
            <Route path="suppliers" element={stores ? <SuppliersSection suppliers={suppliers} canManage onChanged={() => void loadSuppliers()} /> : <Navigate to="/inventory/stock" replace />} />
            <Route path="usage" element={stores ? <UsageSection /> : <Navigate to="/inventory/stock" replace />} />
            <Route path="*" element={<Navigate to="/inventory" replace />} />
          </Routes>
        )}
      </div>
    </DashboardLayout>
  );
}
