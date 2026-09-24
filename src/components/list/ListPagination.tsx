import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Noun for the count line, e.g. "jobs". */
  noun?: string;
}

/** "Showing 1–25 of 140 jobs" with previous/next. Renders nothing when everything fits on one page. */
export function ListPagination({ page, pageSize, total, onPageChange, noun = "results" }: ListPaginationProps) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {first}–{last} of {total} {noun}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-10" onClick={() => onPageChange(page - 1)} disabled={page === 0}>
          <ChevronLeft />
          <span className="hidden sm:inline">Previous</span>
          <span className="sr-only sm:hidden">Previous page</span>
        </Button>
        <span className="tabular-nums text-foreground">
          {page + 1} / {pages}
        </span>
        <Button variant="outline" size="sm" className="h-10" onClick={() => onPageChange(page + 1)} disabled={page >= pages - 1}>
          <span className="hidden sm:inline">Next</span>
          <span className="sr-only sm:hidden">Next page</span>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
