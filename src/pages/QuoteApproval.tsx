import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type State = "open" | "accepted" | "declined" | "expired" | "revoked" | "withdrawn" | "invalid";

interface QuoteView {
  state: State;
  workshop?: { name: string | null; logo_url: string | null; phone: string | null; email: string | null; address: string | null };
  project?: { ref: string | null; title: string; make_model: string | null; registration: string | null; serial_number: string | null };
  customer?: string | null;
  quote?: {
    label: string; kind: "quote" | "change"; title: string | null; reason: string | null; notes: string | null;
    currency: string; subtotal: number; valid_until: string | null; schedule_impact_days: number | null; decided_at: string | null;
    items: { description: string; quantity: number; unit_price: number }[];
  };
  expires_at?: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("quote-link", { body });
  if (error) {
    let message = "Something went wrong. Try again shortly.";
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
  return data as T;
}

const day = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * The page a customer opens from a quote link: no account needed. They see the quote and approve
 * or decline it, confirming with their name.
 */
export default function QuoteApproval() {
  const { token = "" } = useParams<{ token: string }>();
  const [view, setView] = useState<QuoteView | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void call<QuoteView>({ action: "view", token }).then(setView).catch(() => setFailed(true));
  }, [token]);

  const money = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: view?.quote?.currency || "GBP" }).format(Number(n) || 0);

  const decide = async (accept: boolean) => {
    setError(null);
    if (name.trim().length < 2) {
      setError("Type your name to confirm.");
      return;
    }
    setBusy(accept ? "accept" : "decline");
    try {
      const r = await call<{ status: State }>({ action: "decide", token, accept, name: name.trim(), note: note.trim() || undefined });
      setView((v) => (v ? { ...v, state: r.status, quote: v.quote ? { ...v.quote, decided_at: new Date().toISOString() } : v.quote } : v));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  };

  if (!view && !failed) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  }

  const ws = view?.workshop;
  const q = view?.quote;
  const state: State = failed ? "invalid" : view!.state;
  const contact = [ws?.phone, ws?.email].filter(Boolean).join(" · ");

  return (
    <div className="min-h-screen bg-secondary/40 px-4 py-8 sm:py-12">
      <main className="mx-auto max-w-2xl space-y-5">
        <header className="flex items-center gap-3">
          {ws?.logo_url ? <img src={ws.logo_url} alt={ws.name ?? "Workshop"} className="h-10 w-10 rounded-md object-contain" /> : null}
          <span className="text-lg font-semibold">{ws?.name ?? "Your quote"}</span>
        </header>

        {(state === "invalid" || state === "revoked") && (
          <Notice icon={<XCircle className="h-5 w-5 text-destructive" />} title="This link no longer works">
            {state === "revoked" ? "A newer link was sent for this quote. Use the latest one, or ask the workshop to send it again." : "Check you used the whole link, or ask the workshop to send it again."}
          </Notice>
        )}
        {state === "expired" && <Notice icon={<Clock className="h-5 w-5 text-warning" />} title="This quote has expired">Ask {ws?.name ?? "the workshop"} for an updated quote{contact ? ` (${contact})` : ""}.</Notice>}
        {state === "withdrawn" && <Notice icon={<Clock className="h-5 w-5 text-muted-foreground" />} title="This quote isn't open any more">The workshop has replaced or withdrawn it. They'll send you the current one.</Notice>}
        {state === "accepted" && <Notice icon={<CheckCircle2 className="h-5 w-5 text-success" />} title="Quote approved">Thank you. {ws?.name ?? "The workshop"} has been told and will start the work.{q?.decided_at ? ` Approved ${day(q.decided_at)}.` : ""}</Notice>}
        {state === "declined" && <Notice icon={<XCircle className="h-5 w-5 text-muted-foreground" />} title="Quote declined">{ws?.name ?? "The workshop"} has been told{q?.decided_at ? ` (${day(q.decided_at)})` : ""}. They may get in touch with another option.</Notice>}

        {q && view?.project && (
          <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="space-y-1 border-b px-5 py-5 sm:px-7">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{q.kind === "quote" ? "Quote" : "Change request"} {q.label}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{q.title || view.project.title}</h1>
              <p className="text-sm text-muted-foreground">
                {[view.project.ref, view.project.title, view.project.registration, view.project.make_model, view.project.serial_number].filter(Boolean).join(" · ")}
              </p>
              {view.customer && <p className="text-sm text-muted-foreground">For {view.customer}</p>}
            </div>

            {q.reason && (
              <div className="border-b bg-warning-soft/50 px-5 py-4 text-sm sm:px-7">
                <p className="font-medium">Why this change is needed</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{q.reason}</p>
                {q.schedule_impact_days ? <p className="mt-1 text-muted-foreground">Adds about {q.schedule_impact_days} day{q.schedule_impact_days === 1 ? "" : "s"} to the job.</p> : null}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium sm:px-7">Work or part</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">Price</th>
                    <th className="px-5 py-2.5 text-right font-medium sm:px-7">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((i, k) => (
                    <tr key={k} className="border-b last:border-0">
                      <td className="px-5 py-2.5 sm:px-7">{i.description}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{i.quantity}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money(i.unit_price)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums sm:px-7">{money(i.quantity * i.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-baseline justify-between border-t bg-secondary/40 px-5 py-4 sm:px-7">
              <span className="text-sm text-muted-foreground">Total{q.valid_until ? ` · valid until ${day(q.valid_until)}` : ""}</span>
              <span className="text-xl font-semibold tabular-nums">{money(q.subtotal)}</span>
            </div>
            {q.notes && <p className="whitespace-pre-line border-t px-5 py-4 text-sm text-muted-foreground sm:px-7">{q.notes}</p>}

            {state === "open" && (
              <div className="space-y-4 border-t px-5 py-5 sm:px-7">
                <div className="space-y-1.5">
                  <Label htmlFor="qa-name">Your name</Label>
                  <Input id="qa-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="As you'd sign it" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qa-note">Message to the workshop (optional)</Label>
                  <Textarea id="qa-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="If you're declining, telling them why helps them send a better option" />
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="sm:flex-1" size="lg" onClick={() => void decide(true)} disabled={!!busy}>
                    {busy === "accept" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Approve {money(q.subtotal)}
                  </Button>
                  <Button className="sm:flex-1" size="lg" variant="outline" onClick={() => void decide(false)} disabled={!!busy}>
                    {busy === "decline" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Decline
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Approving agrees to the work and price above. Your name, the time and where you approved from are recorded with the quote.
                </p>
              </div>
            )}
          </article>
        )}

        {ws && (contact || ws.address) && (
          <p className="text-center text-sm text-muted-foreground">
            Questions? Contact {ws.name ?? "the workshop"}{contact ? `: ${contact}` : ""}{ws.address ? ` · ${ws.address}` : ""}
          </p>
        )}
      </main>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm" role="status">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
