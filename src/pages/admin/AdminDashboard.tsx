import { useEffect, useState } from "react";
import { Briefcase, Calendar, Package, FileText, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatsCards";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { JobStatusChart } from "@/components/dashboard/JobStatusChart";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { useFeature } from "@/hooks/useFeatureFlags";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";

type RecentJob = {
  id: string;
  title: string;
  status: string;
  date: string;
};

export default function AdminDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const [stats, setStats] = useState({ jobs: 0, appointments: 0, inventory: 0, invoices: 0, users: 0, lowStock: 0 });
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);

    const fetchStats = async () => {
      const [jobs, appts, items, invs, roles, lowStock] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        appointmentsEnabled
          ? supabase.from("appointments").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0, data: null, error: null }),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("quantity, min_stock"),
      ]);
      setStats({
        jobs: jobs.count || 0,
        appointments: appts.count || 0,
        inventory: items.count || 0,
        invoices: invs.count || 0,
        users: roles.count || 0,
        lowStock: (lowStock.data || []).filter((i) => i.quantity <= i.min_stock).length,
      });
    };

    const fetchRecent = async () => {
      const { data } = await supabase.from("jobs").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(5);
      setRecentJobs((data || []).map((j) => ({ id: j.id, title: j.title, status: j.status, date: new Date(j.created_at).toLocaleDateString() })));
    };

    const fetchStatusDistribution = async () => {
      const { data } = await supabase.from("jobs").select("status");
      if (!data) return;
      const counts: Record<string, number> = {};
      data.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
      const statuses = ["pending", "in_progress", "review", "completed", "cancelled"];
      setStatusData(statuses.map(s => ({ name: s.replace("_", " "), value: counts[s] || 0 })).filter(d => d.value > 0));
    };

    Promise.all([fetchStats(), fetchRecent(), fetchStatusDistribution()]).finally(() => setIsLoading(false));
  }, [appointmentsEnabled]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-muted-foreground">Overview of your entire workshop</p>
        </div>

        <AdminOnboardingChecklist />

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {appointmentsEnabled && <StatCard
              title="Total Jobs"
              value={stats.jobs}
              icon={Briefcase}
              description="All workshop jobs"
              iconClassName="bg-gradient-to-br from-blue-500 to-blue-700"
            />}
            <StatCard
              title="Appointments"
              value={stats.appointments}
              icon={Calendar}
              description="Scheduled bookings"
              iconClassName="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
            <StatCard
              title="Inventory Items"
              value={stats.inventory}
              icon={Package}
              description="Items tracked"
              iconClassName="bg-gradient-to-br from-violet-500 to-violet-700"
            />
            <StatCard
              title="Invoices"
              value={stats.invoices}
              icon={FileText}
              description="Total invoices"
              iconClassName="bg-gradient-to-br from-amber-400 to-orange-500"
            />
            <StatCard
              title="Total Users"
              value={stats.users}
              icon={Users}
              description="Registered users"
              iconClassName="bg-gradient-to-br from-sky-500 to-cyan-600"
            />
            <StatCard
              title="Low Stock Alerts"
              value={stats.lowStock}
              icon={AlertTriangle}
              description="Items below minimum"
              iconClassName="bg-gradient-to-br from-rose-500 to-red-600"
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <JobStatusChart data={statusData} />
          <RecentActivity activities={recentJobs} title="Recent Jobs" />
        </div>

        <ActivityFeed />
      </div>
    </DashboardLayout>
  );
}
