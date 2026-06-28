import { cn } from "@/lib/utils";
import { ReactNode } from "react";

/**
 * Responsive action-button toolbar for page headers.
 * On mobile: stacks vertically, each child is full-width.
 * On sm+: inline, right-aligned, content-width.
 */
export default function PageActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
