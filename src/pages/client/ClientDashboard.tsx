import { useEffect, useState } from "react";
import { Briefcase, Calendar, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatsCards";
import { RecentActivity } from "@/components/dashboard/RecentActivity";

export default function ClientDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ jobs: 0, appointments: 0, invoices: 0 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [jobs, appts, invs] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("client_id", user.id),
        supabase.from("appointments").select("*", { count: "exact", head: true }).eq("client_id", user.id),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("client_id", user.id),
      ]);
      setStats({ jobs: jobs.count || 0, appointments: appts.count || 0, invoices: invs.count || 0 });
      const { data } = await supabase.from("jobs").select("id, title, status, created_at").eq("client_id", user.id).order("created_at", { ascending: false }).limit(5);
      setRecentJobs((data || []).map((j) => ({ id: j.id, title: j.title, status: j.status, date: new Date(j.created_at).toLocaleDateString() })));
    };
    fetch();
  }, [user]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
          <p className="text-muted-foreground">Your jobs, appointments, and invoices</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="My Jobs" value={stats.jobs} icon={Briefcase} />
          <StatCard title="Appointments" value={stats.appointments} icon={Calendar} />
          <StatCard title="Invoices" value={stats.invoices} icon={FileText} />
        </div>
        <RecentActivity activities={recentJobs} title="My Recent Jobs" />
      </div>
    </DashboardLayout>
  );
}
