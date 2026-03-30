import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["hsl(222.2, 47.4%, 11.2%)", "hsl(210, 40%, 96.1%)", "hsl(0, 84.2%, 60.2%)", "hsl(215.4, 16.3%, 46.9%)", "hsl(210, 40%, 50%)"];

export default function AdminReports() {
  const [bookings, setBookings] = useState<{ month: string; count: number }[]>([]);
  const [revenue, setRevenue] = useState<{ month: string; revenue: number }[]>([]);
  const [jobStats, setJobStats] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    supabase.rpc("get_monthly_bookings").then(({ data }) => setBookings((data as any[])?.map((d) => ({ month: d.month, count: Number(d.count) })) || []));
    supabase.rpc("get_monthly_revenue").then(({ data }) => setRevenue((data as any[])?.map((d) => ({ month: d.month, revenue: Number(d.revenue) })) || []));
    supabase.rpc("get_job_completion_stats").then(({ data }) => setJobStats((data as any[])?.map((d) => ({ status: d.status, count: Number(d.count) })) || []));
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground">Analytics overview of your workshop</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Bookings */}
          <Card>
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
                  <Bar dataKey="count" fill="hsl(222.2, 47.4%, 11.2%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

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
                  <Line type="monotone" dataKey="revenue" stroke="hsl(222.2, 47.4%, 11.2%)" strokeWidth={2} />
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
                    label={({ status, count }) => `${status} (${count})`}
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
      </div>
    </DashboardLayout>
  );
}
