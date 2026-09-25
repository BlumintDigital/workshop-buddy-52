import { cn } from "@/lib/utils";

const TONE = {
  neutral: "bg-secondary text-muted-foreground",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-destructive-soft text-destructive",
} as const;

export type StatusTone = keyof typeof TONE;

interface StatusPillProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/** State label: a soft semantic background plus a dot, so state never relies on colour alone. */
export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const JOB_TONE: Record<string, StatusTone> = {
  quote: "warning",
  pending: "neutral",
  in_progress: "info",
  review: "warning",
  completed: "success",
  cancelled: "neutral",
};

const JOB_LABEL: Record<string, string> = {
  quote: "Quote",
  pending: "Pending",
  in_progress: "In progress",
  review: "Awaiting review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function JobStatusPill({ status }: { status: string }) {
  return <StatusPill tone={JOB_TONE[status] ?? "neutral"}>{JOB_LABEL[status] ?? status.replace(/_/g, " ")}</StatusPill>;
}

/** Priority as a pill for urgent and high, plain text otherwise, so only what needs attention stands out. */
export function PriorityLabel({ priority }: { priority: string }) {
  if (priority === "urgent") return <StatusPill tone="danger">Urgent</StatusPill>;
  if (priority === "high") return <StatusPill tone="warning">High</StatusPill>;
  return <span className="capitalize text-muted-foreground">{priority}</span>;
}

/** Stock level against the item's reorder point. */
export function StockPill({ item }: { item: { quantity: number; min_stock: number } }) {
  if (item.quantity <= 0) return <StatusPill tone="danger">Out of stock</StatusPill>;
  if (item.quantity <= item.min_stock) return <StatusPill tone="warning">Low stock</StatusPill>;
  return <StatusPill tone="success">In stock</StatusPill>;
}
