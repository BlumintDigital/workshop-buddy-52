import { useEffect, useState } from "react";
import { Briefcase, Calendar, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatsCards";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Skeleton } from "@/components/ui/skeleton";

export default function StaffDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ assigned: 0, inProgress: 0, completed: 0 });
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const run = async () => {
      const [all, ip, done] = await Promise.all([
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id).eq("status", "in_progress"),
        supabase.from("jobs").select("*", { count: "exact", head: true }).eq("assigned_staff_id", user.id).eq("status", "completed"),
      ]);
      setStats({ assigned: all.count || 0, inProgress: ip.count || 0, completed: done.count || 0 });
      const { data } = await supabase.from("jobs").select("id, title, status, created_at").eq("assigned_staff_id", user.id).order("created_at", { ascending: false }).limit(5);
      setMyJobs((data || []).map((j) => ({ id: j.id, title: j.title, status: j.status, date: new Date(j.created_at).toLocaleDateString() })));
    };
    run().finally(() => setIsLoading(false));
  }, [user]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Staff Dashboard</h2>
          <p className="text-muted-foreground">Your assigned jobs and schedule</p>
        </div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard title="Assigned Jobs" value={stats.assigned} icon={Briefcase} />
            <StatCard title="In Progress" value={stats.inProgress} icon={Calendar} />
            <StatCard title="Completed" value={stats.completed} icon={CheckCircle} />
          </div>
        )}
        <RecentActivity activities={myJobs} title="My Recent Jobs" />
      </div>
    </DashboardLayout>
  );
}
