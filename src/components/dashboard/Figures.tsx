import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Figure = {
  label: string;
  value: string;
  /** A change against a stated baseline, e.g. "12% vs October". The arrow and the words carry the direction. */
  delta?: { text: string; direction: "up" | "down"; tone: "good" | "bad" };
  /** Context line under the value. */
  detail?: string;
  detailTone?: "default" | "good" | "bad";
  /** A small chart drawn from the same data as the figure. Decorative: the value and detail say it in words. */
  chart?: ReactNode;
  to: string;
};

const DETAIL_TONE = {
  default: "text-muted-foreground",
  good: "text-success",
  bad: "text-destructive",
};

const DELTA_TONE = {
  good: "bg-success-soft text-success",
  bad: "bg-destructive-soft text-destructive",
};

const COLUMNS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/**
 * The headline figures, one card each, every card opening the list behind it. Two per row on phones;
 * an odd last figure takes the full width so the row never ends in a gap.
 */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <section aria-label="Figures" className={cn("grid grid-cols-2 gap-3 sm:gap-4", COLUMNS[items.length] ?? "lg:grid-cols-4")}>
      {items.map((f, i) => {
        const DeltaIcon = f.delta?.direction === "down" ? ArrowDownRight : ArrowUpRight;
        return (
          <Link
            key={f.label}
            to={f.to}
            className={cn(
              "group flex min-h-[132px] min-w-0 flex-col rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
              items.length % 2 === 1 && i === items.length - 1 && "col-span-2 lg:col-span-1",
            )}
          >
            <span className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
              <span className="min-w-0">{f.label}</span>
              <ArrowUpRight
                className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden
              />
            </span>
            <span className="mt-2 truncate text-xl font-semibold sm:text-[1.75rem] leading-tight tabular-nums tracking-tight">{f.value}</span>
            {f.chart && (
              <span className="mt-3 block h-7" aria-hidden>
                {f.chart}
              </span>
            )}
            <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-xs">
              {f.delta && (
                <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums", DELTA_TONE[f.delta.tone])}>
                  <DeltaIcon className="h-3 w-3" aria-hidden />
                  {f.delta.text}
                </span>
              )}
              {f.detail && <span className={cn("min-w-0", DETAIL_TONE[f.detailTone ?? "default"])}>{f.detail}</span>}
            </span>
          </Link>
        );
      })}
    </section>
  );
}

/** Tiny bar chart for a figure card: the last bar is the current period. Zero periods keep a hairline stub. */
export function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const last = values.length - 1;
  return (
    <span className="flex h-full items-end gap-1">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-[2px]", i === last ? "bg-primary" : v > 0 ? "bg-primary/30" : "bg-border")}
          style={{ height: v > 0 ? `${Math.max(12, (v / max) * 100)}%` : "2px" }}
        />
      ))}
    </span>
  );
}

/** Tiny split bar for a figure card: how much of the whole is the part, e.g. overdue within unpaid. */
export function MiniSplit({ part, whole }: { part: number; whole: number }) {
  const pct = whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
  return (
    <span className="flex h-full flex-col justify-end">
      <span className="flex h-2 overflow-hidden rounded-full bg-primary/25">
        <span className="h-full bg-destructive" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
