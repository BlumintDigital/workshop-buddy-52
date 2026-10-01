import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { guideSlug } from "@/lib/guideAnchors";
import { cn } from "@/lib/utils";
import { WORKFLOW_STAGES, findPageHelp, type RoleHelp } from "@/lib/pageHelp";

const SEEN_PREFIX = "shoplane-help-seen:";

function hasSeen(key: string): boolean {
  try {
    return localStorage.getItem(SEEN_PREFIX + key) === "1";
  } catch {
    return true; // storage unavailable: don't nag
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, "1");
  } catch {
    /* storage unavailable */
  }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/**
 * The "?" in the header: what this page is for, where it sits in a project's life and what you can
 * do here. Shown only on pages that have help for your role. Press ? to open it.
 */
export function PageHelp() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const match = findPageHelp(pathname, role);
  const key = match?.entry.key ?? null;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    setOpen(false);
    setSeen(key ? hasSeen(key) : true);
  }, [key]);

  const openHelp = useCallback(() => {
    if (!key) return;
    setOpen(true);
    if (!hasSeen(key)) {
      markSeen(key);
      setSeen(true);
    }
    // Counts only: which pages people need help with. Shown to Shoplane Control as totals.
    void (supabase.rpc as any)("log_help_view", { p_page_key: key }).then(() => undefined, () => undefined);
  }, [key]);

  useEffect(() => {
    if (!key) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      openHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, openHelp]);

  if (!match) return null;
  const { entry, help } = match;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 shrink-0"
        onClick={openHelp}
        aria-label={`Help: how ${entry.title} works`}
        title="How this page works (?)"
      >
        <CircleHelp className="h-5 w-5" />
        {!seen && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
            aria-hidden="true"
          />
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("flex flex-col gap-0 overflow-y-auto p-0", isMobile ? "max-h-[85vh] rounded-t-2xl" : "w-full sm:max-w-md")}
        >
          <SheetHeader className="space-y-2 border-b px-6 py-5 text-left">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">How this page works</p>
            <SheetTitle className="text-xl">{entry.title}</SheetTitle>
            <SheetDescription className="text-sm leading-relaxed text-foreground/80">{help.purpose}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-6 py-5">
            <WorkflowStrip help={help} />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">What you can do here</h3>
              <ul className="space-y-2.5">
                {help.actions.map((action) => (
                  <li key={action} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="mt-auto border-t px-6 py-4">
            <Button asChild variant="outline" className="w-full justify-between">
              <Link to={`/help#${guideSlug(help.guideHeading)}`} onClick={() => setOpen(false)}>
                Read the full guide
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">Tip: press ? on any page to open this.</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** A project's stages, with the ones this page works on highlighted. */
function WorkflowStrip({ help }: { help: RoleHelp }) {
  const highlighted = new Set(help.stages);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Where this fits</h3>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Project stages">
        {WORKFLOW_STAGES.map((stage, i) => {
          const on = highlighted.has(stage);
          return (
            <li key={stage} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  on ? "border-primary bg-primary text-primary-foreground font-medium" : "border-border bg-muted/50 text-muted-foreground",
                )}
                aria-current={on ? "step" : undefined}
              >
                {stage}
              </span>
              {i < WORKFLOW_STAGES.length - 1 && <span className="text-xs text-muted-foreground" aria-hidden="true">→</span>}
            </li>
          );
        })}
      </ol>
      {help.workflowNote && <p className="text-xs leading-relaxed text-muted-foreground">{help.workflowNote}</p>}
    </section>
  );
}
