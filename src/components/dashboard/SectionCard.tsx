import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function SectionCard({ title, description, action, footer, className, bodyClassName, children }: SectionCardProps) {
  return (
    <Card className={cn("flex min-w-0 max-w-full flex-col overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 pt-5 pb-4 sm:px-6">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold leading-none tracking-tight">{title}</h3>}
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <CardContent className={cn("flex-1 p-5 sm:p-6", bodyClassName)}>{children}</CardContent>
      {footer && <div className="border-t border-border/50 px-5 py-3 text-xs text-muted-foreground sm:px-6">{footer}</div>}
    </Card>
  );
}
