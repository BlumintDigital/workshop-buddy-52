import { useEffect, useState, type ReactNode } from "react";

interface ChartFigureProps {
  /** What the chart shows, e.g. "Revenue by month". */
  label: string;
  /** The plotted values, read out to screen readers as a table. */
  rows: { label: string; value: string | number }[];
  valueHeader?: string;
  children: ReactNode;
}

/**
 * Wraps a chart so assistive tech gets the numbers as a table instead of an
 * unlabelled drawing. The chart itself is hidden from screen readers.
 */
export function ChartFigure({ label, rows, valueHeader = "Value", children }: ChartFigureProps) {
  return (
    <figure aria-label={label} className="m-0">
      <div aria-hidden="true">{children}</div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const TOKENS = ["primary", "info", "warning", "destructive", "success", "muted-foreground"] as const;
type ChartToken = (typeof TOKENS)[number];

/**
 * Series colours read from the live design tokens, so charts follow the
 * workshop's brand colour and theme instead of fixed hex values.
 */
export function useChartColors(): Record<ChartToken, string> {
  const read = () =>
    Object.fromEntries(
      TOKENS.map((t) => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(`--${t}`).trim();
        return [t, v ? `hsl(${v})` : "currentColor"];
      }),
    ) as Record<ChartToken, string>;
  const [colors, setColors] = useState(read);

  useEffect(() => {
    // Brand colours are applied as inline styles on <html>; re-read when they change.
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

/** Tooltip styling from the theme tokens, so tooltips stay readable in light and dark. */
export const chartTooltipProps = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--popover-foreground))", fontWeight: 600 },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted))" },
} as const;
