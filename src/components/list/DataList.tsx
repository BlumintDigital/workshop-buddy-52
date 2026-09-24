import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Hide this column in the table below this breakpoint (it still shows in the phone card). */
  hideBelow?: "md" | "lg" | "xl";
  className?: string;
  align?: "left" | "right";
};

interface DataListProps<T> {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  /** Makes each row (and phone card) a link. */
  getRowHref?: (row: T) => string | undefined;
  /** Phone layout: title line, trailing element (usually a status pill) and detail line. */
  mobile: {
    title: (row: T) => ReactNode;
    trailing?: (row: T) => ReactNode;
    meta?: (row: T) => ReactNode;
  };
  isLoading?: boolean;
  empty: ReactNode;
  /** Optional per-row actions cell (buttons), rendered last in both layouts. */
  actions?: (row: T) => ReactNode;
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

/**
 * The shared list body: a table from 640px up and a stack of tappable cards on
 * phones, from one column definition. Loading and empty states are built in.
 */
export function DataList<T>({ rows, columns, getRowKey, getRowHref, mobile, isLoading, empty, actions }: DataListProps<T>) {
  if (!isLoading && rows.length === 0) {
    return <div className="rounded-lg border bg-card px-4 py-10 text-center">{empty}</div>;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
      {/* Table: 640px and up */}
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("h-10 text-xs font-medium text-muted-foreground", c.hideBelow && HIDE[c.hideBelow], c.align === "right" && "text-right", c.className)}
                >
                  {c.header}
                </TableHead>
              ))}
              {actions && <TableHead className="h-10 w-px"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={cn(c.hideBelow && HIDE[c.hideBelow])}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                    {actions && <TableCell />}
                  </TableRow>
                ))
              : rows.map((row) => {
                  const href = getRowHref?.(row);
                  return (
                    <TableRow key={getRowKey(row)} className={cn(href && "relative cursor-pointer")}>
                      {columns.map((c, i) => (
                        <TableCell
                          key={c.key}
                          className={cn("py-3", c.hideBelow && HIDE[c.hideBelow], c.align === "right" && "text-right tabular-nums", c.className)}
                        >
                          {i === 0 && href ? (
                            // The first cell's link stretches over the whole row, so any cell is clickable
                            // while the row stays a real link for keyboard and screen-reader users.
                            <Link to={href} className="font-medium after:absolute after:inset-0 after:content-[''] hover:underline">
                              {c.cell(row)}
                            </Link>
                          ) : (
                            c.cell(row)
                          )}
                        </TableCell>
                      ))}
                      {actions && (
                        <TableCell className="relative z-10 w-px whitespace-nowrap py-2 text-right">{actions(row)}</TableCell>
                      )}
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      {/* Cards: phones */}
      <ul className="divide-y sm:hidden">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </li>
            ))
          : rows.map((row) => {
              const href = getRowHref?.(row);
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words text-sm font-semibold">{mobile.title(row)}</span>
                    {mobile.trailing && <span className="shrink-0">{mobile.trailing(row)}</span>}
                  </div>
                  {mobile.meta && <div className="mt-1 text-xs text-muted-foreground">{mobile.meta(row)}</div>}
                </>
              );
              return (
                <li key={getRowKey(row)} className="relative">
                  {href ? (
                    <Link to={href} className="block min-h-[56px] p-4 active:bg-secondary">
                      {body}
                    </Link>
                  ) : (
                    <div className="p-4">{body}</div>
                  )}
                  {actions && <div className="flex justify-end gap-2 px-4 pb-3">{actions(row)}</div>}
                </li>
              );
            })}
      </ul>
    </div>
  );
}
