import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: ReactNode;
  /** Optional link in the header, e.g. "View all jobs". */
  link?: { label: string; to: string };
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Bordered dashboard section with a compact header row. */
export function Panel({ title, link, actions, className, children }: PanelProps) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card text-card-foreground", className)}>
      <header className="flex min-h-[48px] items-center justify-between gap-3 border-b px-4 py-2">
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold tracking-normal">{title}</h2>
        <div className="flex items-center gap-2">
          {actions}
          {link && (
            <Link
              to={link.to}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
            >
              {link.label}
            </Link>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}
