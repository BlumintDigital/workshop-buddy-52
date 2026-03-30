import { useEffect, useState } from "react";
import { Briefcase, Calendar, Package, FileText, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatsCards";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { JobStatusChart } from "@/components/dashboard/JobStatusChart";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ jobs: 0, appointments: 0, inventory: 0, invoices: 0, users: 0, lowStock: 0 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [jobs, appts, items, invs, roles, lowStock] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        supabase.from("appointments").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }).filter("quantity", "lte", "min_stock" as any),
      ]);
      setStats({
        jobs: jobs.count || 0,
        appointments: appts.count || 0,
        inventory: items.count || 0,
        invoices: invs.count || 0,
        users: roles.count || 0,
        lowStock: lowStock.count || 0,
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

    fetchStats();
    fetchRecent();
    fetchStatusDistribution();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <p className="text-muted-foreground">Overview of your entire workshop</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Jobs"
            value={stats.jobs}
            icon={Briefcase}
            description="All workshop jobs"
            iconClassName="bg-gradient-to-br from-blue-500 to-blue-700"
          />
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

        <div className="grid gap-4 md:grid-cols-2">
          <JobStatusChart data={statusData} />
          <RecentActivity activities={recentJobs} title="Recent Jobs" />
        </div>
      </div>
    </DashboardLayout>
  );
}
