import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; count?: number };

interface ListControlsProps {
  filters?: FilterOption[];
  filter?: string;
  onFilterChange?: (value: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Extra controls (selects, date pickers) shown after the search box. */
  children?: React.ReactNode;
}

/**
 * Filter chips and search for list pages. The chips are one row that scrolls
 * sideways on phones, so the same control works at every width (no separate
 * mobile dropdown).
 */
export function ListControls({
  filters,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
}: ListControlsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
      {filters && filters.length > 0 && (
        <div
          role="radiogroup"
          aria-label="Filter"
          className="-mx-3 flex min-w-0 gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-1 [&::-webkit-scrollbar]:hidden"
        >
          {filters.map((f) => {
            const active = f.value === filter;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onFilterChange?.(f.value)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card text-foreground hover:bg-secondary",
                )}
              >
                {f.label}
                {f.count != null && f.count > 0 && (
                  <span className={cn("tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{f.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        {onSearchChange && (
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 pl-9"
            />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
