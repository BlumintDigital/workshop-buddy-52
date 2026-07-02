import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronRight, ClipboardCheck, FileWarning, Package, UserPlus, CheckCircle2 } from "lucide-react";

type ActionItem = {
  key: string;
  label: string;
  to: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

export function PendingActions() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [reviewJobs, overdueInv, stockItems, pendingInvites] = await Promise.all([
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
        .lt("due_date", nowIso),
      supabase.from("inventory_items").select("quantity, min_stock"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("invited_at", "is", null)
        .is("invite_accepted_at", null),
    ]);

    const lowStockCount = (stockItems.data || []).filter((i: any) => i.quantity <= i.min_stock).length;

    setCounts({
      review: reviewJobs.count ?? 0,
      overdue: overdueInv.count ?? 0,
      lowStock: lowStockCount,
      invites: pendingInvites.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCounts();
    const id = setInterval(fetchCounts, 60_000);
    const onFocus = () => fetchCounts();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchCounts]);

  const items: ActionItem[] = [
    { key: "review", label: "Jobs awaiting review", to: "/admin/jobs", count: counts.review ?? 0, icon: ClipboardCheck, tone: "bg-sky-100 text-sky-700" },
    { key: "overdue", label: "Overdue invoices", to: "/admin/invoices", count: counts.overdue ?? 0, icon: FileWarning, tone: "bg-rose-100 text-rose-700" },
    { key: "lowStock", label: "Low stock items", to: "/admin/inventory", count: counts.lowStock ?? 0, icon: Package, tone: "bg-amber-100 text-amber-700" },
    { key: "invites", label: "Pending user invites", to: "/admin/users", count: counts.invites ?? 0, icon: UserPlus, tone: "bg-violet-100 text-violet-700" },
  ];

  const visible = items.filter((i) => i.count > 0);

  return (
    <Card tone="mist">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Pending actions
        </CardTitle>
        <CardDescription>Items that need your attention</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-2 text-accent" />
            <p className="text-sm">All clear — nothing pending.</p>
          </div>
        ) : (
          visible.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                to={item.to}
                className="flex items-center gap-3 rounded-lg border bg-card/60 px-3 py-3 hover:bg-card transition-colors"
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-md ${item.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                <Badge variant="secondary">{item.count}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
