import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: ReactNode;
  /** One muted line under the title saying what the card shows. */
  description?: ReactNode;
  /** Optional link in the header, e.g. "View all jobs". */
  link?: { label: string; to: string };
  actions?: ReactNode;
  /** Draw a rule under the header. Off for cards whose body is a figure or a chart rather than a list. */
  divided?: boolean;
  className?: string;
  children: ReactNode;
}

/** Dashboard card with a title, an optional one-line description and a header link. */
export function Panel({ title, description, link, actions, divided = true, className, children }: PanelProps) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <header className={cn("flex min-h-[52px] items-start justify-between gap-3 px-5 pb-3 pt-4", divided && "border-b")}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-sans text-base font-semibold leading-6 tracking-normal">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="-my-2.5 flex shrink-0 items-center gap-2">
          {actions}
          {link && (
            <Link
              to={link.to}
              className="inline-flex min-h-[44px] items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
