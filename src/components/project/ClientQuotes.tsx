import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { agreedTotal, loadQuotes, quoteLabel, type Quote } from "@/components/project/ProjectQuotes";
import { formatDate } from "@/lib/format";

/**
 * Quotes and change requests as the client sees them: the ones waiting for a
 * decision first, with accept and decline, then what's already agreed.
 */
export default function ClientQuotes({ project, onDecided }: { project: { id: string; ref: string }; onDecided: () => void }) {
  const { format: fmt, currency: base } = useCurrency();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [declining, setDeclining] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setQuotes(await loadQuotes(project.id)), [project.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (q: Quote, accept: boolean, note?: string) => {
    setBusy(q.id);
    const { error } = await supabase.rpc("decide_project_quote", { _quote_id: q.id, _accept: accept, _note: note ?? undefined });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(
      accept
        ? q.kind === "quote"
          ? "Quote accepted. The workshop will plan the work."
          : "Change accepted. The workshop will carry on."
        : "Declined. The workshop has been told.",
    );
    await load();
    onDecided();
  };

  const waiting = quotes.filter((q) => q.status === "sent");
  const past = quotes.filter((q) => q.status === "accepted" || q.status === "declined");
  if (waiting.length === 0 && past.length === 0) return null;
  const agreed = agreedTotal(quotes);

  return (
    <>
      {waiting.map((q) => (
        <Card key={q.id} className="border-warning/40">
          <CardHeader className="pb-2">
            <p className="font-mono text-xs text-muted-foreground">{quoteLabel(project.ref, q)}</p>
            <CardTitle className="text-lg">{q.kind === "quote" ? "Your quote is ready" : "A change needs your approval"}</CardTitle>
            {q.title && <p className="text-sm font-medium">{q.title}</p>}
            {q.reason && <p className="text-sm text-muted-foreground">{q.reason}</p>}
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-md border text-sm">
              {q.items.map((i, idx) => (
                <li key={i.id ?? idx} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    {i.description}
                    {i.quantity !== 1 && <span className="text-muted-foreground"> × {i.quantity}</span>}
                  </span>
                  <span className="tabular-nums">{fmt(i.quantity * i.unit_price, q.currency ?? base)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 px-3 py-2 font-semibold">
                <span>Total before tax</span>
                <span className="tabular-nums">{fmt(q.subtotal, q.currency ?? base)}</span>
              </li>
            </ul>
            {q.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{q.notes}</p>}
            <p className="text-xs text-muted-foreground">
              {q.schedule_impact_days ? `Adds about ${q.schedule_impact_days} day${Math.abs(q.schedule_impact_days) === 1 ? "" : "s"}. ` : ""}
              {q.valid_until ? `Valid until ${formatDate(q.valid_until)}.` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void decide(q, true)} disabled={busy === q.id}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                Accept {q.kind === "quote" ? "quote" : "change"}
              </Button>
              <Button variant="outline" onClick={() => setDeclining(q)} disabled={busy === q.id}>
                <XCircle className="mr-1.5 h-4 w-4 text-destructive" aria-hidden />
                Decline
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {past.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quotes and changes</CardTitle>
            {agreed > 0 && <p className="text-sm text-muted-foreground">Agreed so far: <span className="font-medium tabular-nums text-foreground">{fmt(agreed)}</span> before tax</p>}
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {past.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-muted-foreground">{quoteLabel(project.ref, q)}</span>
                    <span className="block truncate">{q.title || (q.kind === "quote" ? "Quote" : "Change request")}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{fmt(q.subtotal, q.currency ?? base)}</span>
                    <StatusPill tone={q.status === "accepted" ? "success" : "danger"}>{q.status === "accepted" ? "Accepted" : "Declined"}</StatusPill>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {declining && <DeclineQuote label={quoteLabel(project.ref, declining)} onClose={() => setDeclining(null)} onConfirm={(note) => { const q = declining; setDeclining(null); void decide(q, false, note); }} />}
    </>
  );
}

function DeclineQuote({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Decline {label}?</DialogTitle>
          <DialogDescription>Telling the workshop why helps them send a better option.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-client-decline">Reason (optional)</Label>
          <Textarea id="f-client-decline" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Go back
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(note.trim())}>
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
