import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  to: string;
  icon: LucideIcon;
  primary?: boolean;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <Link
          key={a.label}
          to={a.to}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all",
            a.primary
              ? "border-transparent bg-gradient-sage text-primary-foreground shadow-elevation hover:brightness-110"
              : "border-border/70 bg-card/60 text-foreground backdrop-blur hover:border-primary/50 hover:text-primary",
          )}
        >
          <a.icon className="h-4 w-4" />
          {a.label}
        </Link>
      ))}
    </div>
  );
}
