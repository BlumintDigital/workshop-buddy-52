import { useEffect, useState } from "react";
import { Briefcase, Calendar, Package, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatsCards";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

export default function ManagerDashboard() {
  const [stats, setStats] = useState({ jobs: 0, appointments: 0, inventory: 0, invoices: 0 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const [jobs, appts, items, invs] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }),
        supabase.from("appointments").select("*", { count: "exact", head: true }),
        supabase.from("inventory_items").select("*", { count: "exact", head: true }),
        supabase.from("invoices").select("*", { count: "exact", head: true }),
      ]);
      setStats({ jobs: jobs.count || 0, appointments: appts.count || 0, inventory: items.count || 0, invoices: invs.count || 0 });
      const { data } = await supabase.from("jobs").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(5);
      setRecentJobs((data || []).map((j) => ({ id: j.id, title: j.title, status: j.status, date: new Date(j.created_at).toLocaleDateString() })));
    };
    fetch();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Manager Dashboard</h2>
          <p className="text-muted-foreground">Manage jobs, staff, and operations</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Active Jobs" value={stats.jobs} icon={Briefcase} />
          <StatCard title="Appointments" value={stats.appointments} icon={Calendar} />
          <StatCard title="Inventory" value={stats.inventory} icon={Package} />
          <StatCard title="Invoices" value={stats.invoices} icon={FileText} />
        </div>
        <RecentActivity activities={recentJobs} title="Recent Jobs" />
      </div>
    </DashboardLayout>
  );
}
