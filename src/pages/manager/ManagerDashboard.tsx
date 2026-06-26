import { useEffect, useState } from "react";
import { Briefcase, Calendar, Package, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatsCards";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { useFeature } from "@/hooks/useFeatureFlags";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManagerDashboard() {
  const appointmentsEnabled = useFeature("appointments");
  const [stats, setStats] = useState({ jobs: 0, appointments: 0, inventory: 0, invoices: 0 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const run = async () => {
      const [jobs, appts, items, invs] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        appointmentsEnabled
          ? supabase.from("appointments").select("*", { count: "exact", head: true })
          : Promise.resolve({ count: 0, data: null, error: null }),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("*", { count: "exact", head: true }),
      ]);
      setStats({ jobs: jobs.count || 0, appointments: appts.count || 0, inventory: items.count || 0, invoices: invs.count || 0 });
      const { data } = await supabase.from("jobs").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(5);
      setRecentJobs((data || []).map((j) => ({ id: j.id, title: j.title, status: j.status, date: new Date(j.created_at).toLocaleDateString() })));
    };
    run().finally(() => setIsLoading(false));
  }, [appointmentsEnabled]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Manager Dashboard</h2>
          <p className="text-muted-foreground">Manage jobs, staff, and operations</p>
        </div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Active Jobs" value={stats.jobs} icon={Briefcase} />
            {appointmentsEnabled && <StatCard title="Appointments" value={stats.appointments} icon={Calendar} />}
            <StatCard title="Inventory" value={stats.inventory} icon={Package} />
            <StatCard title="Invoices" value={stats.invoices} icon={FileText} />
          </div>
        )}
        <RecentActivity activities={recentJobs} title="Recent Jobs" />
      </div>
    </DashboardLayout>
  );
}
