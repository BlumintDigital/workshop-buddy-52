import { Check } from "lucide-react";
import { CLIENT_STAGES, clientStageIndex } from "@/lib/projects";
import { cn } from "@/lib/utils";

/**
 * Where the project is, in the client's terms. Seven stages from "Received" to
 * "Shipped"; a cancelled project shows a single line instead.
 */
export default function StageTracker({ status, dates }: { status: string; dates?: Partial<Record<string, string>> }) {
  if (status === "cancelled") {
    return <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">This project was cancelled.</p>;
  }
  const current = clientStageIndex(status);

  return (
    <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7 sm:gap-0" aria-label="Project progress">
      {CLIENT_STAGES.map((stage, i) => {
        const done = i < current || (i === current && status === "shipped");
        const active = i === current && !done;
        return (
          <li
            key={stage.key}
            className="relative flex items-center gap-3 sm:flex-col sm:gap-1.5 sm:text-center"
            aria-current={active ? "step" : undefined}
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute right-1/2 top-3 hidden h-0.5 w-full sm:block", i <= current ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-card text-primary",
                !done && !active && "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-sm sm:text-xs", active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
              {stage.label}
              {dates?.[stage.key] && <span className="block text-xs text-muted-foreground">{dates[stage.key]}</span>}
              <span className="sr-only">{done ? " (done)" : active ? " (current)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
