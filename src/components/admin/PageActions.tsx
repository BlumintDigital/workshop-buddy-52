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
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}
