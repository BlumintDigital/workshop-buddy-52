import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--primary))",
  review: "hsl(45, 93%, 47%)",
  completed: "hsl(142, 76%, 36%)",
  cancelled: "hsl(var(--destructive))",
};

interface JobStatusChartProps {
  data: { name: string; value: number }[];
}

export function JobStatusChart({ data }: JobStatusChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">Job Status Distribution</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {total === 0 ? (
          <p className="text-center text-muted-foreground py-8">No jobs yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={78} paddingAngle={3} dataKey="value" nameKey="name" labelLine={false} label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "hsl(var(--muted))"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
