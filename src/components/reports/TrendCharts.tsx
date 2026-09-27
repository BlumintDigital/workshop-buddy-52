import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/csv";
import { useFeature } from "@/hooks/useFeatureFlags";
import { ChartFigure, chartTooltipProps, useChartColors } from "@/components/dashboard/ChartFigure";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// Series colours come from the live design tokens (see useChartColors), so charts
// follow the workshop's brand colour and theme. Each clears 3:1 against the card.

// Legend text follows the page foreground instead of the series colour, so it stays readable.
const legendFormatter = (value: string) => (
  <span className="text-sm text-foreground">{value.replace(/_/g, " ")}</span>
);

/** Month-by-month bookings, revenue and projects by status. */
export function TrendCharts() {
  const c = useChartColors();
  const series = [c.primary, c.info, c.warning, c.destructive, c["muted-foreground"]];
  const appointmentsEnabled = useFeature("appointments");
  const [bookings, setBookings] = useState<{ month: string; count: number }[]>([]);
  const [revenue, setRevenue] = useState<{ month: string; revenue: number }[]>([]);
  const [jobStats, setJobStats] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    if (appointmentsEnabled) {
      supabase.rpc("get_monthly_bookings").then(({ data }) => setBookings((data as any[])?.map((d) => ({ month: d.month, count: Number(d.count) })) || []));
    } else {
      setBookings([]);
    }
    supabase.rpc("get_monthly_revenue").then(({ data }) => setRevenue((data as any[])?.map((d) => ({ month: d.month, revenue: Number(d.revenue) })) || []));
    supabase.rpc("get_job_completion_stats").then(({ data }) => setJobStats((data as any[])?.map((d) => ({ status: d.status, count: Number(d.count) })) || []));
  }, [appointmentsEnabled]);

  return (
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
          <ChartFigure label="Bookings per month" valueHeader="Bookings" rows={bookings.map((b) => ({ label: b.month, value: b.count }))}>
<ResponsiveContainer width="100%" height={300}>
            <BarChart data={bookings}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip {...chartTooltipProps} />
              <Bar dataKey="count" fill={c.info} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
</ChartFigure>
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
          <ChartFigure label="Revenue per month" valueHeader="Revenue" rows={revenue.map((r) => ({ label: r.month, value: r.revenue }))}>
<ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip {...chartTooltipProps} />
              <Line type="monotone" dataKey="revenue" stroke={c.primary} strokeWidth={2} dot={{ fill: c.primary, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
</ChartFigure>
        </CardContent>
      </Card>

      {/* Job Completion Stats */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Projects by status</CardTitle>
          <Button variant="outline" size="sm" onClick={() => downloadCSV("job-stats.csv", ["Status", "Count"], jobStats.map((j) => [j.status, j.count]))}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        </CardHeader>
        <CardContent className="flex justify-center">
          <ChartFigure label="Projects by status" valueHeader="Projects" rows={jobStats.map((j) => ({ label: j.status.replace(/_/g, " "), value: j.count }))}>
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
                  <Cell key={idx} fill={series[idx % series.length]} />
                ))}
              </Pie>
              <Tooltip {...chartTooltipProps} />
              <Legend formatter={legendFormatter} />
            </PieChart>
          </ResponsiveContainer>
</ChartFigure>
        </CardContent>
      </Card>
    </div>
  );
}
