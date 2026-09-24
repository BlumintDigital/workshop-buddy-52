import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type Figure = {
  label: string;
  value: string;
  /** Context line under the value. */
  detail?: string;
  detailTone?: "default" | "good" | "bad";
  to: string;
};

const DETAIL_TONE = {
  default: "text-muted-foreground",
  good: "text-success",
  bad: "text-destructive",
};

/** A single row of headline figures. Each one links to the list behind it. */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <section
      aria-label="Figures"
      className="grid grid-cols-2 overflow-hidden rounded-lg border bg-card lg:grid-cols-4"
    >
      {items.map((f, i) => (
        <Link
          key={f.label}
          to={f.to}
          className={cn(
            "flex min-h-[88px] flex-col gap-1 border-border p-4 transition-colors hover:bg-secondary/60",
            i % 2 === 0 && "border-r",
            i < items.length - 2 && "border-b lg:border-b-0",
            "lg:border-r lg:last:border-r-0",
          )}
        >
          <span className="text-sm text-muted-foreground">{f.label}</span>
          <span className="font-sans text-xl font-semibold tabular-nums tracking-tight">{f.value}</span>
          {f.detail && <span className={cn("text-xs", DETAIL_TONE[f.detailTone ?? "default"])}>{f.detail}</span>}
        </Link>
      ))}
    </section>
  );
}
