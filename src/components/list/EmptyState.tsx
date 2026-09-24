import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Says what is missing and offers the next step. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="mx-auto max-w-sm space-y-1">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="pt-3">{action}</div>}
    </div>
  );
}
