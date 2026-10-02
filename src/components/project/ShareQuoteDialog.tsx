import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

async function createLink(quoteId: string, opts: { send: boolean; email?: string }) {
  const { data, error } = await supabase.functions.invoke("quote-link", { body: { action: "create", quote_id: quoteId, send: opts.send, email: opts.email || undefined } });
  if (error) {
    let message = "Couldn't make the link. Try again.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        message = (await ctx.json())?.error ?? message;
      } catch {
        /* keep the generic message */
      }
    }
    throw new Error(message);
  }
  return data as { url: string; emailed?: boolean; sent_to?: string; reason?: string };
}

/**
 * Share a sent quote by secure link, for customers without a portal account. They open it, see
 * the quote and approve or decline. Making a new link stops any earlier one working.
 */
export default function ShareQuoteDialog({
  open,
  onOpenChange,
  quote,
  defaultEmail,
  onShared,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quote: { id: string; label: string } | null;
  defaultEmail: string | null;
  onShared?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "copy" | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(defaultEmail ?? "");
      setUrl(null);
      setCopied(false);
    }
  }, [open, defaultEmail]);
  if (!quote) return null;

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.message("Select the link and copy it");
    }
  };

  const makeAndCopy = async () => {
    setBusy("copy");
    try {
      const r = await createLink(quote.id, { send: false });
      setUrl(r.url);
      await copy(r.url);
      onShared?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(null);
  };

  const makeAndEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Enter the customer's email address");
    setBusy("email");
    try {
      const r = await createLink(quote.id, { send: true, email: email.trim() });
      setUrl(r.url);
      if (r.emailed) toast.success(`Emailed to ${r.sent_to}`);
      else toast.warning(r.reason ?? "The email didn't send. Copy the link instead.");
      onShared?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" aria-hidden />Share {quote.label} by link</DialogTitle>
          <DialogDescription>
            The customer opens the link, sees the quote and approves or declines it. No account needed. You're notified when they decide.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="share-email">Customer's email</Label>
            <div className="flex gap-2">
              <Input id="share-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
              <Button onClick={() => void makeAndEmail()} disabled={!!busy}>
                {busy === "email" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}Email it
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or send it yourself (WhatsApp, text)<span className="h-px flex-1 bg-border" />
          </div>
          {url ? (
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Quote link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => void copy(url)}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}<span className="sr-only">Copy link</span></Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => void makeAndCopy()} disabled={!!busy}>
              {busy === "copy" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}Copy a link
            </Button>
          )}
          <p className="text-xs text-muted-foreground">The link works until the quote's valid-until date (or 30 days). Making a new one stops the old one.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
