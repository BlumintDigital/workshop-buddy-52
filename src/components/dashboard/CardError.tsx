import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown in place of a card's figures when they couldn't load, so a failure never reads as 0. */
export function CardError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-4 text-sm">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
      <span className="min-w-0 flex-1">Couldn't load {what}. Check your connection and try again.</span>
      <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-9" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
