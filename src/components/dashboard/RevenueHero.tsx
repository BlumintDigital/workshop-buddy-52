import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";

interface RevenueHeroProps {
  greeting: string;
  totalRevenue: number;
  delta?: string;
  series: { label: string; value: number }[];
  rangeLabel?: string;
  onRangeChange?: (range: "week" | "month" | "year") => void;
  currentRange?: "week" | "month" | "year";
}

export function RevenueHero({ greeting, totalRevenue, delta, series, onRangeChange, currentRange = "month" }: RevenueHeroProps) {
  const { format } = useCurrency();
  const [range, setRange] = useState(currentRange);
  const positive = delta ? !delta.startsWith("-") : true;

  const average = useMemo(() => {
    if (!series.length) return 0;
    return series.reduce((s, p) => s + p.value, 0) / series.length;
  }, [series]);

  const handleRange = (r: "week" | "month" | "year") => {
    setRange(r);
    onRangeChange?.(r);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl card-elevated">
      <div className="absolute inset-0 bg-gradient-hero opacity-80" aria-hidden />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr,1.6fr] lg:items-end">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h2 className="mt-1 text-display text-3xl leading-tight sm:text-4xl">
            Welcome back<span className="text-muted-foreground">.</span>
          </h2>
          <p className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">Total revenue</p>
          <div className="mt-1 flex items-baseline gap-3">
            <p className="text-display text-5xl leading-none tracking-tight tabular-nums sm:text-6xl">
              {format(totalRevenue)}
            </p>
            {delta && (
              <span
                className={cn(
                  "rounded-full border px-2 py-1 text-xs font-medium tabular-nums",
                  positive ? "border-accent/40 bg-accent/10 text-accent" : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {positive ? "+" : "-"}
                {delta.replace(/^-/, "")}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Average per period: <span className="tabular-nums text-foreground">{format(Math.round(average))}</span></p>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end">
            <div className="inline-flex rounded-full border border-border/70 bg-card/60 p-1 text-xs">
              {(["week", "month", "year"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRange(r)}
                  className={cn(
                    "rounded-full px-3 py-1 capitalize transition-colors",
                    range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} barCategoryGap={4}>
                <defs>
                  <linearGradient id="rh-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "hsl(var(--primary) / 0.08)" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [format(v), "Revenue"]}
                />
                <Bar dataKey="value" fill="url(#rh-bar)" radius={[6, 6, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
