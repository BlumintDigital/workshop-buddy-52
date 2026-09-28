import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { accountingCall, PROVIDER_LABEL, type InvoiceAccounting } from "@/lib/accounting";
import { relativeTime } from "@/lib/profileNames";
import { cn } from "@/lib/utils";

/**
 * One line on the invoice page: where this invoice stands in the connected
 * accounting system, with a way to retry when it didn't get there.
 */
export function AccountingSyncStatus({
  info,
  invoiceId,
  invoiceStatus,
  isAdmin,
  onChanged,
}: {
  info: InvoiceAccounting;
  invoiceId: string;
  invoiceStatus: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"sync" | "pay" | null>(null);
  const where = PROVIDER_LABEL[info.provider];

  const sync = async () => {
    setBusy("sync");
    try {
      const { error } = await supabase.rpc("accounting_sync_invoice", { _invoice_id: invoiceId });
      if (error) throw new Error(error.message);
      const r = await accountingCall<{ failed: number }>({ action: "sync" });
      if (r.failed) toast.error(`Couldn't sync to ${where}. See the reason below.`);
      else toast.success(`Synced to ${where}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  const simulatePayment = async () => {
    setBusy("pay");
    try {
      await accountingCall({ action: "simulate-payment", invoice_id: invoiceId });
      toast.success("The test books marked it paid; Shoplane picked it up.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      onChanged();
    }
  };

  let text: string;
  let tone: "ok" | "wait" | "bad" | "idle";
  if (info.job_status === "failed") {
    text = `Couldn't reach ${where}: ${info.job_error ?? "unknown problem"}`;
    tone = "bad";
  } else if (info.job_status === "queued" || info.job_status === "running") {
    text = info.job_error ? `Waiting to retry sending to ${where} (${info.job_error})` : `Waiting to sync to ${where}`;
    tone = "wait";
  } else if (info.external_number || info.synced_at) {
    text = `In ${where}${info.external_number ? ` as #${info.external_number}` : ""}${info.synced_at ? ` · checked ${relativeTime(info.synced_at)}` : ""}`;
    tone = "ok";
  } else {
    text = invoiceStatus === "draft" ? `Goes to ${where} when you send it` : `Not in ${where} yet`;
    tone = "idle";
  }

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm",
        tone === "bad" ? "border-destructive/30 bg-destructive-soft" : tone === "wait" ? "border-warning/30 bg-warning-soft" : "bg-card",
      )}
    >
      <span className="min-w-0">{text}</span>
      <span className="flex flex-wrap gap-2">
        {info.external_url && (
          <Button asChild variant="ghost" size="sm">
            <a href={info.external_url} target="_blank" rel="noopener noreferrer">
              Open in {where}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </a>
          </Button>
        )}
        {invoiceStatus !== "draft" && (
          <Button variant="outline" size="sm" onClick={() => void sync()} disabled={!!busy}>
            {busy === "sync" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />}
            {tone === "bad" ? "Retry" : "Sync now"}
          </Button>
        )}
        {isAdmin && info.provider === "test" && info.external_number && invoiceStatus !== "paid" && (
          <Button variant="outline" size="sm" onClick={() => void simulatePayment()} disabled={!!busy}>
            {busy === "pay" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Simulate a payment
          </Button>
        )}
      </span>
    </div>
  );
}
