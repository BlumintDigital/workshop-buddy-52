import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: string;
  iconClassName?: string;
}

export function StatCard({ title, value, description, icon: Icon, trend, iconClassName }: StatCardProps) {
  const trendIsPositive = trend && !trend.startsWith("-");

  return (
    <Card className="border-0 shadow-[0_1px_2px_hsl(222_47%_11%/0.04),0_4px_12px_hsl(222_47%_11%/0.07),0_0_0_1px_hsl(var(--border))]">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
            {trend && (
              <p className={cn("mt-1 text-xs font-medium", trendIsPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                {trendIsPositive ? "↑" : "↓"} {trend}
              </p>
            )}
            {description && !trend && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn(
            "ml-4 shrink-0 rounded-xl p-3",
            iconClassName ?? "bg-gradient-to-br from-slate-600 to-slate-800"
          )}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
