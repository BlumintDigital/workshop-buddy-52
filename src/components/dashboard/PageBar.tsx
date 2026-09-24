import type { ReactNode } from "react";

interface PageBarProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Compact page header: title and context on the left, actions on the right. */
export function PageBar({ title, subtitle, actions }: PageBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
