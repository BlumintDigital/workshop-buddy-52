import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TickerItem {
  label: string;
  value: ReactNode;
  to?: string;
  icon?: LucideIcon;
  tone?: "default" | "warn" | "danger" | "good";
}

const toneMap: Record<NonNullable<TickerItem["tone"]>, string> = {
  default: "text-foreground",
  good: "text-accent",
  warn: "text-amber-400",
  danger: "text-destructive",
};

export function LiveTickerStrip({ items }: { items: TickerItem[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl card-elevated surface-violet">
      <div className="grid divide-y divide-border/50 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        {items.map((item) => {
          const content = (
            <div className="flex items-center gap-3 px-5 py-4">
              {item.icon && (
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <p className={cn("text-display text-2xl leading-tight tabular-nums", toneMap[item.tone ?? "default"])}>
                  {item.value}
                </p>
              </div>
            </div>
          );
          return item.to ? (
            <Link
              key={item.label}
              to={item.to}
              className="block transition-colors hover:bg-primary/5"
            >
              {content}
            </Link>
          ) : (
            <div key={item.label}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
