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

/**
 * Legacy StatCard — kept for callers that haven't migrated to MetricCard.
 */
export function StatCard({ title, value, description, icon: Icon, trend, iconClassName }: StatCardProps) {
  const trendIsPositive = trend && !trend.startsWith("-");

  return (
    <Card className="group min-w-0 max-w-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-elevation">
      <CardContent className="p-5 sm:p-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            {/* break-words + tighter sizes keep long currency values from colliding with the icon */}
            <p className="mt-3 text-display text-2xl leading-tight tracking-tight tabular-nums break-words sm:text-4xl">{value}</p>
            {trend && (
              <p className={cn("mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
                trendIsPositive ? "border-accent/30 bg-accent/10 text-accent" : "border-destructive/30 bg-destructive/10 text-destructive")}>
                {trendIsPositive ? "↑" : "↓"} {trend.replace(/^-/, "")}
              </p>
            )}
            {description && !trend && (
              <p className="mt-2 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn(
            "shrink-0 rounded-lg bg-secondary p-2.5 text-foreground",
            iconClassName,
          )}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
