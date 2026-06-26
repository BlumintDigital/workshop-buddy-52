import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv";
import { useFeature } from "@/hooks/useFeatureFlags";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = [
  "hsl(217, 91%, 60%)",   // bright blue
  "hsl(152, 69%, 46%)",   // emerald
  "hsl(38, 95%, 56%)",    // amber
  "hsl(0, 84%, 60%)",     // red
  "hsl(267, 84%, 64%)",   // violet
];

interface StaffStat {
  staff_name: string;
  actual_hours: number;
  estimated_hours: number;
  efficiency: number;
  jobs_completed: number;
}

export default function AdminReports() {
  const appointmentsEnabled = useFeature("appointments");
  const [bookings, setBookings] = useState<{ month: string; count: number }[]>([]);
  const [revenue, setRevenue] = useState<{ month: string; revenue: number }[]>([]);
  const [jobStats, setJobStats] = useState<{ status: string; count: number }[]>([]);
  const [staffStats, setStaffStats] = useState<StaffStat[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);

  useEffect(() => {
    if (appointmentsEnabled) {
      supabase.rpc("get_monthly_bookings").then(({ data }) => setBookings((data as any[])?.map((d) => ({ month: d.month, count: Number(d.count) })) || []));
    } else {
      setBookings([]);
    }
    supabase.rpc("get_monthly_revenue").then(({ data }) => setRevenue((data as any[])?.map((d) => ({ month: d.month, revenue: Number(d.revenue) })) || []));
    supabase.rpc("get_job_completion_stats").then(({ data }) => setJobStats((data as any[])?.map((d) => ({ status: d.status, count: Number(d.count) })) || []));
    fetchStaffStats();
  }, [appointmentsEnabled]);

  const fetchStaffStats = async () => {
    setIsLoadingStaff(true);
    const { data: jobs } = await supabase
      .from("jobs")
      .select("assigned_staff_id, actual_hours, estimated_hours, status")
      .not("assigned_staff_id", "is", null);

    if (!jobs || jobs.length === 0) { setIsLoadingStaff(false); return; }

    const staffIds = [...new Set(jobs.map(j => j.assigned_staff_id!))];
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", staffIds);
    const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name || "Unknown"]));

    const grouped: Record<string, { actual: number; estimated: number; completed: number }> = {};
    jobs.forEach(j => {
      if (!grouped[j.assigned_staff_id]) grouped[j.assigned_staff_id] = { actual: 0, estimated: 0, completed: 0 };
      grouped[j.assigned_staff_id].actual += Number(j.actual_hours) || 0;
      grouped[j.assigned_staff_id].estimated += Number(j.estimated_hours) || 0;
      if (j.status === "completed") grouped[j.assigned_staff_id].completed += 1;
    });

    const stats: StaffStat[] = Object.entries(grouped).map(([id, g]) => ({
      staff_name: nameMap.get(id) || "Unknown",
      actual_hours: Math.round(g.actual * 10) / 10,
      estimated_hours: Math.round(g.estimated * 10) / 10,
      efficiency: g.estimated > 0 ? Math.round((g.actual / g.estimated) * 100) : 0,
      jobs_completed: g.completed,
    }));

    setStaffStats(stats.sort((a, b) => b.actual_hours - a.actual_hours));
    setIsLoadingStaff(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground">Analytics overview of your workshop</p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="staff">Staff Efficiency</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Bookings */}
              {appointmentsEnabled && <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Monthly Bookings</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => downloadCSV("bookings.csv", ["Month", "Count"], bookings.map((b) => [b.month, b.count]))}>
                    <Download className="mr-2 h-4 w-4" />CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={bookings}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>}

              {/* Monthly Revenue */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Revenue</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => downloadCSV("revenue.csv", ["Month", "Revenue"], revenue.map((r) => [r.month, r.revenue]))}>
                    <Download className="mr-2 h-4 w-4" />CSV
                  </Button>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenue}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line type="monotone" dataKey="revenue" stroke="hsl(152, 69%, 46%)" strokeWidth={2} dot={{ fill: "hsl(152, 69%, 46%)", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Job Completion Stats */}
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Job Completion Rate</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => downloadCSV("job-stats.csv", ["Status", "Count"], jobStats.map((j) => [j.status, j.count]))}>
                    <Download className="mr-2 h-4 w-4" />CSV
                  </Button>
                </CardHeader>
                <CardContent className="flex justify-center">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={jobStats}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        label={(props: any) => `${props.status} (${props.count})`}
                      >
                        {jobStats.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <div className="space-y-6">
              {isLoadingStaff ? (
                <>
                  <Skeleton className="h-64 rounded-xl" />
                  <Skeleton className="h-52 rounded-xl" />
                </>
              ) : staffStats.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No staff hours data yet. Staff must log actual hours on jobs for this report to populate.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Actual vs Estimated hours bar chart */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Actual vs Estimated Hours</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadCSV(
                          "staff-efficiency.csv",
                          ["Staff", "Actual Hours", "Estimated Hours", "Efficiency %", "Jobs Completed"],
                          staffStats.map(s => [s.staff_name, s.actual_hours, s.estimated_hours, s.efficiency, s.jobs_completed])
                        )}
                      >
                        <Download className="mr-2 h-4 w-4" />CSV
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={staffStats} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis type="category" dataKey="staff_name" width={100} className="text-xs" />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="estimated_hours" name="Estimated (h)" fill="hsl(217, 91%, 80%)" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="actual_hours" name="Actual (h)" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Efficiency % bar chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Efficiency Ratio</CardTitle>
                      <p className="text-sm text-muted-foreground">Actual hours ÷ estimated hours × 100. Below 100% = under estimate, above 100% = over estimate.</p>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={staffStats} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" unit="%" className="text-xs" />
                          <YAxis type="category" dataKey="staff_name" width={100} className="text-xs" />
                          <Tooltip formatter={(v) => `${v}%`} />
                          <Bar dataKey="efficiency" name="Efficiency %" fill="hsl(267, 84%, 64%)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
