import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  delta?: string;
  hint?: string;
  accent?: "violet" | "lime" | "neutral";
  sparkline?: ReactNode;
  onClick?: () => void;
}

const accentMap: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  violet: "bg-primary/15 text-primary border-primary/30",
  lime: "bg-accent/15 text-accent border-accent/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  hint,
  accent = "violet",
  sparkline,
  onClick,
}: MetricCardProps) {
  const positive = delta ? !delta.startsWith("-") : true;
  return (
    <Card
      className={cn(
        "group min-w-0 max-w-full overflow-hidden transition-all hover:-translate-y-0.5 hover:card-glow",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          {Icon && (
            <div className={cn("rounded-xl border p-2", accentMap[accent])}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="mt-4 flex items-baseline gap-3">
          <p className="text-display text-4xl leading-none tracking-tight tabular-nums sm:text-5xl">{value}</p>
          {delta && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
                positive
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {positive ? "↑" : "↓"} {delta.replace(/^-/, "")}
            </span>
          )}
        </div>
        {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
        {sparkline && <div className="mt-4 h-12">{sparkline}</div>}
      </CardContent>
    </Card>
  );
}
