import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CardError } from "./CardError";
import { Panel } from "./Panel";
import { StatusPill, type StatusTone } from "./StatusPill";
import type { TodoItem, TodoSeverity } from "@/lib/dashboardTodo";
import { cn } from "@/lib/utils";

const TONE: Record<TodoSeverity, StatusTone> = { danger: "danger", warning: "warning", info: "info" };

/** The count tile takes the severity's soft colour; the pill on the same line says it in words. */
const COUNT_TONE: Record<TodoSeverity, string> = {
  danger: "bg-destructive-soft text-destructive",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

interface TodoSummaryProps {
  items: TodoItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * "To do": one line per kind of work waiting. The number is the exact count; the whole line opens
 * the list filtered to those items. Most urgent first.
 */
export function TodoSummary({ items, isLoading, isError, onRetry }: TodoSummaryProps) {
  const ready = !isLoading && !isError;
  return (
    <Panel
      title="To do"
      description={ready && items.length > 0 ? "Most urgent first. Each line opens the list behind it" : "What needs a decision or a chase"}
    >
      {isLoading ? (
        <div className="space-y-2 p-5" aria-busy="true" aria-label="Loading to do">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <CardError what="the to do list" onRetry={onRetry} />
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          Nothing waiting on you. Overdue invoices, sign-offs, approvals and low stock show up here.
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                className="grid min-h-[64px] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg text-base font-semibold tabular-nums",
                    item.count === null ? "bg-secondary" : COUNT_TONE[item.severity],
                  )}
                >
                  {item.count ?? ""}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  {item.meta && <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.meta}</span>}
                  <StatusPill tone={TONE[item.severity]} className="mt-1.5 sm:hidden">{item.label}</StatusPill>
                </span>
                <span className="flex items-center gap-3">
                  <StatusPill tone={TONE[item.severity]} className="hidden sm:inline-flex">{item.label}</StatusPill>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
