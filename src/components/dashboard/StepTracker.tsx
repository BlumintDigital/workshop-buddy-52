import { cn } from "@/lib/utils";

interface StepTrackerProps {
  steps: string[];
  /** Index of the current step; steps before it are done. */
  current: number;
  className?: string;
}

/** Horizontal progress through a fixed sequence of named steps, e.g. a job's lifecycle. */
export function StepTracker({ steps, current, className }: StepTrackerProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, i) => (
          <li
            key={step}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "h-1.5 rounded-full",
              i < current ? "bg-primary" : i === current ? "bg-primary/50" : "bg-secondary",
            )}
          >
            <span className="sr-only">
              {step}
              {i < current ? " (done)" : i === current ? " (current)" : ""}
            </span>
          </li>
        ))}
      </ol>
      <div
        aria-hidden
        className="grid gap-1 text-xs text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <span key={step} className={cn("truncate", i === current && "font-semibold text-foreground")}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
