import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "./Panel";
import { StatusPill, type StatusTone } from "./StatusPill";
import type { AttentionItem, AttentionSeverity } from "@/hooks/useAttentionItems";
import { cn } from "@/lib/utils";

const SEVERITY: Record<AttentionSeverity, { tone: StatusTone; icon: typeof AlertCircle; iconClass: string }> = {
  danger: { tone: "danger", icon: AlertCircle, iconClass: "text-destructive" },
  warning: { tone: "warning", icon: TriangleAlert, iconClass: "text-warning" },
  info: { tone: "info", icon: Clock, iconClass: "text-info" },
};

interface AttentionQueueProps {
  items: AttentionItem[];
  isLoading: boolean;
}

/** "Needs attention": every row names the problem and carries the button that deals with it. */
export function AttentionQueue({ items, isLoading }: AttentionQueueProps) {
  return (
    <Panel
      title={
        <>
          Needs attention
          {!isLoading && items.length > 0 && <StatusPill tone="warning">{items.length}</StatusPill>}
        </>
      }
    >
      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          Nothing needs you right now. New sign-offs, overdue invoices and low stock will show up here.
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const { tone, icon: Icon, iconClass } = SEVERITY[item.severity];
            return (
              <li
                key={item.id}
                className="grid grid-cols-[20px_1fr] items-start gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[20px_1fr_auto_auto] sm:items-center"
              >
                <Icon className={cn("mt-0.5 h-5 w-5 sm:mt-0", iconClass)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.meta && <p className="mt-0.5 text-sm text-muted-foreground">{item.meta}</p>}
                </div>
                <div className="col-start-2 flex items-center gap-2 sm:col-start-auto sm:contents">
                  <StatusPill tone={tone}>{item.label}</StatusPill>
                  <Button asChild variant={item.severity === "danger" ? "default" : "outline"} size="sm" className="min-h-[44px] sm:min-h-0">
                    <Link to={item.action.to}>{item.action.label}</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
