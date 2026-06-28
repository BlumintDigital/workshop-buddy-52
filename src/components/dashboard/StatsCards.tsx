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
    <Card className="min-w-0 max-w-full overflow-hidden border-0 shadow-[0_1px_2px_hsl(222_47%_11%/0.04),0_4px_12px_hsl(222_47%_11%/0.07),0_0_0_1px_hsl(var(--border))]">
      <CardContent className="p-4 sm:p-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 break-words text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</p>
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
            "shrink-0 rounded-xl p-2.5 sm:p-3",
            iconClassName ?? "bg-gradient-to-br from-slate-600 to-slate-800"
          )}>
            <Icon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
