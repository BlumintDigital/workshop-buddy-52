import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(240 8% 50%)",
  "in progress": "hsl(258 90% 76%)",
  in_progress: "hsl(258 90% 76%)",
  review: "hsl(45 93% 60%)",
  completed: "hsl(74 80% 66%)",
  cancelled: "hsl(0 72% 60%)",
};

interface JobStatusChartProps {
  data: { name: string; value: number }[];
}

export function JobStatusChart({ data }: JobStatusChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Job Status</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No jobs yet</p>
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-[1fr,1fr]">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={4} dataKey="value" nameKey="name" stroke="none">
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "hsl(var(--muted))"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {data.map((d) => {
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.name} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[d.name] || "hsl(var(--muted))" }} />
                      <span className="truncate capitalize text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="tabular-nums text-foreground">{d.value} <span className="text-muted-foreground">· {pct}%</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
