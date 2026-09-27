import { useState } from "react";
import { AlertTriangle, Check, Copy, Home, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { errorReport, isStaleBuildError } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface ErrorScreenProps {
  error: Error;
  /** "page" keeps the sidebar and header; "full" replaces the whole app. */
  variant: "page" | "full";
  /** Re-render the page without reloading (page variant only). */
  onRetry?: () => void;
}

/**
 * What people see when something breaks: a plain explanation, a way forward,
 * and details they can copy into an issue report.
 */
export function ErrorScreen({ error, variant, onRetry }: ErrorScreenProps) {
  const [copied, setCopied] = useState(false);
  const stale = isStaleBuildError(error);

  const copy = async () => {
    if (await copyText(errorReport(error))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const card = (
    <div role="alert" className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
      <div className={cn("mx-auto grid h-12 w-12 place-items-center rounded-full", stale ? "bg-info-soft text-info" : "bg-destructive-soft text-destructive")}>
        {stale ? <RefreshCw className="h-6 w-6" aria-hidden /> : <AlertTriangle className="h-6 w-6" aria-hidden />}
      </div>
      <h1 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
        {stale ? "A new version is ready" : variant === "page" ? "This page ran into a problem" : "Something went wrong"}
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        {stale
          ? "Shoplane was updated while this page was open. Reload to carry on; nothing you saved is lost."
          : variant === "page"
            ? "The rest of the app still works. Try again, or reload if it keeps happening."
            : "Reloading usually fixes it. If it keeps happening, copy the details and report the issue."}
      </p>

      <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        {!stale && variant === "page" && onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            Try again
          </Button>
        )}
        {!stale && variant === "full" && (
          <Button variant="outline" asChild>
            <a href="/">
              <Home className="mr-1.5 h-4 w-4" aria-hidden />
              Go to home
            </a>
          </Button>
        )}
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          Reload page
        </Button>
      </div>

      {!stale && (
        <details className="mt-6 text-left">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Technical details</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs text-foreground">
            {import.meta.env.DEV ? errorReport(error) : error.message}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button variant="ghost" size="sm" className="-ml-3" onClick={() => void copy()}>
              {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy details"}
            </Button>
            <a href="/report-issue" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Report an issue
            </a>
          </div>
        </details>
      )}
    </div>
  );

  if (variant === "full") return <div className="grid min-h-svh place-items-center bg-background p-4">{card}</div>;
  return <div className="grid min-h-[60vh] place-items-center py-8">{card}</div>;
}
