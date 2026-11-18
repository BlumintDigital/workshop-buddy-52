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

const COLUMNS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * A single row of headline figures. Each one links to the list behind it. Two per row on phones;
 * an odd last figure takes the full width so the strip never ends in a gap.
 */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <section
      aria-label="Figures"
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border", COLUMNS[items.length] ?? "lg:grid-cols-4")}
    >
      {items.map((f, i) => (
        <Link
          key={f.label}
          to={f.to}
          className={cn(
            "flex min-h-[96px] flex-col gap-1 bg-card p-4 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            items.length % 2 === 1 && i === items.length - 1 && "col-span-2 lg:col-span-1",
          )}
        >
          <span className="text-sm text-muted-foreground">{f.label}</span>
          <span className="font-sans text-2xl font-semibold tabular-nums tracking-tight">{f.value}</span>
          {f.detail && <span className={cn("text-xs", DETAIL_TONE[f.detailTone ?? "default"])}>{f.detail}</span>}
        </Link>
      ))}
    </section>
  );
}
