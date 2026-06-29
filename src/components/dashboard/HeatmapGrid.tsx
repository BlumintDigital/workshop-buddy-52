import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface HeatmapGridProps {
  /** Counts indexed by day (0=Mon..6=Sun) and hour-bucket (0..N-1). */
  data: number[][];
  hours: string[];
  className?: string;
}

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HeatmapGrid({ data, hours, className }: HeatmapGridProps) {
  const max = useMemo(() => Math.max(1, ...data.flat()), [data]);

  const cell = (v: number) => {
    const t = v / max;
    if (v === 0) return "bg-muted/40";
    if (t < 0.25) return "bg-primary/20";
    if (t < 0.5) return "bg-primary/40";
    if (t < 0.75) return "bg-primary/65";
    return "bg-primary";
  };

  return (
    <div className={cn("min-w-0", className)}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `40px repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
        {hours.map((h, hourIdx) => (
          <>
            <div key={`label-${h}`} className="text-right text-[10px] text-muted-foreground/80">{h}</div>
            {days.map((d, dayIdx) => (
              <div
                key={`${h}-${d}`}
                title={`${d} ${h}: ${data[dayIdx]?.[hourIdx] ?? 0}`}
                className={cn("aspect-square rounded-md transition-colors", cell(data[dayIdx]?.[hourIdx] ?? 0))}
              />
            ))}
          </>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0.1, 0.3, 0.55, 0.8, 1].map((t) => (
          <div key={t} className={cn("h-2.5 w-2.5 rounded-sm", cell(t * max))} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
