import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, ArrowRight, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type NoticeTone = "info" | "warning" | "danger";

const TONE: Record<NoticeTone, { box: string; chip: string; link: string; Icon: LucideIcon }> = {
  info: { box: "border-info/25 bg-info-soft", chip: "bg-card text-info", link: "text-info", Icon: Info },
  warning: { box: "border-warning/30 bg-warning-soft", chip: "bg-card text-warning", link: "text-warning", Icon: TriangleAlert },
  danger: { box: "border-destructive/30 bg-destructive-soft", chip: "bg-card text-destructive", link: "text-destructive", Icon: AlertOctagon },
};

interface NoticeBannerProps {
  tone: NoticeTone;
  title: string;
  message?: ReactNode;
  /** Replaces the tone's icon, e.g. a bell for personal notices. */
  icon?: LucideIcon;
  action?: { label: string; href: string };
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * A slim notice across the top of the page: what it's about at a glance, an
 * optional next step, and a close button. Urgent ones are announced to screen
 * readers straight away; the rest are read politely.
 */
export function NoticeBanner({ tone, title, message, icon, action, onDismiss, dismissLabel = "Dismiss" }: NoticeBannerProps) {
  const t = TONE[tone];
  const Icon = icon ?? t.Icon;
  const external = action && /^https?:\/\//i.test(action.href);
  const actionClass = cn("inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold underline-offset-4 hover:underline", t.link);

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5 animate-in fade-in slide-in-from-top-1 sm:items-center sm:px-4", t.box)}
    >
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full shadow-sm", t.chip)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-baseline">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {message && <p className="min-w-0 text-sm text-foreground">{message}</p>}
        {action &&
          (external ? (
            <a href={action.href} target="_blank" rel="noopener noreferrer" className={cn(actionClass, "sm:ml-auto")}>
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : (
            <Link to={action.href} className={cn(actionClass, "sm:ml-auto")}>
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ))}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-foreground/70 transition-colors hover:bg-card/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
