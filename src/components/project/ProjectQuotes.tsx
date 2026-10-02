import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { formatDate } from "@/lib/format";
import ShareQuoteDialog from "@/components/project/ShareQuoteDialog";

export type Quote = {
  id: string;
  job_id: string;
  kind: "quote" | "change";
  number: number;
  title: string;
  reason: string | null;
  notes: string | null;
  currency: string | null;
  subtotal: number;
  schedule_impact_days: number | null;
  valid_until: string | null;
  status: "draft" | "pending_approval" | "sent" | "accepted" | "declined" | "withdrawn";
  sent_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  items: { id?: string; description: string; quantity: number; unit_price: number; position: number }[];
};

export const QUOTE_STATUS: Record<Quote["status"], { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for admin sign-off", tone: "warning" },
  sent: { label: "Waiting for client", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export const quoteLabel = (ref: string, q: Pick<Quote, "kind" | "number">) => `${ref}-${q.kind === "quote" ? "Q" : "CR"}${q.number}`;

export async function loadQuotes(jobId: string): Promise<Quote[]> {
  const { data } = await supabase
    .from("project_quotes")
    .select("*, project_quote_items(id, description, quantity, unit_price, position)")
    .eq("job_id", jobId)
    .order("kind", { ascending: false })
    .order("number");
  return (data ?? []).map((q) => ({
    ...(q as unknown as Quote),
    subtotal: Number(q.subtotal),
    items: [...(q.project_quote_items ?? [])].sort((a, b) => a.position - b.position).map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
  }));
}

/** What the client has agreed to pay: the accepted quote plus accepted change requests. */
export const agreedTotal = (quotes: Quote[]) => quotes.filter((q) => q.status === "accepted").reduce((s, q) => s + q.subtotal, 0);

interface Props {
  project: { id: string; ref: string; title: string; status: string; client_id: string | null; contact_email?: string | null };
  /** Reception, planners, admins and managers draft and send. */
  canQuote: boolean;
  onChanged?: () => void;
}

/**
 * The project's quotes and change requests. A quote goes straight to the
 * client; a change request (extra work or cost after approval) needs an
 * admin's sign-off first. Walk-in clients' decisions are recorded by staff.
 */
export default function ProjectQuotes({ project, canQuote, onChanged }: Props) {
  const { role } = useAuth();
  const { format: fmt, currency: baseCurrency } = useCurrency();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [editing, setEditing] = useState<Quote | { kind: Quote["kind"] } | null>(null);
  const [deciding, setDeciding] = useState<{ quote: Quote; accept: boolean } | null>(null);
  const [sharing, setSharing] = useState<Quote | null>(null);
  const isAdmin = role === "admin";

  const load = useCallback(async () => setQuotes(await loadQuotes(project.id)), [project.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const hasAcceptedQuote = quotes.some((q) => q.kind === "quote" && q.status === "accepted");
  const canNewQuote = canQuote && ["received", "evaluation", "quote"].includes(project.status) && !hasAcceptedQuote;
  const canNewChange = canQuote && ["pending", "in_progress", "review"].includes(project.status);
  const agreed = agreedTotal(quotes);
  const shown = quotes.filter((q) => q.status !== "withdrawn" || quotes.length <= 3);

  const call = async (fn: () => PromiseLike<{ error: { message: string } | null }>, success: string) => {
    const { error } = await fn();
    if (error) return toast.error(error.message);
    toast.success(success);
    await load();
    onChanged?.();
  };

  if (!canQuote && quotes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5" aria-hidden />
            Quotes and changes
          </CardTitle>
          {agreed > 0 && <p className="mt-0.5 text-sm text-muted-foreground">Agreed with client: <span className="font-medium tabular-nums text-foreground">{fmt(agreed)}</span></p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canNewQuote && (
            <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "quote" })}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New quote
            </Button>
          )}
          {canNewChange && (
            <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "change" })}>
              <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden />
              Change request
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canNewQuote
              ? "No quote yet. Evaluations are free; add a quote when you know the price."
              : canNewChange
                ? "The project is approved. If the work or cost changes, raise a change request for the client to approve."
                : "No quotes on this project."}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((q) => {
              const s = QUOTE_STATUS[q.status];
              const cur = q.currency ?? baseCurrency;
              return (
                <li key={q.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">{quoteLabel(project.ref, q)}</p>
                      <p className="text-sm font-semibold">{q.title || (q.kind === "quote" ? "Quote" : "Change request")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{fmt(q.subtotal, cur)}</span>
                      <StatusPill tone={s.tone}>{s.label}</StatusPill>
                    </div>
                  </div>
                  {q.reason && <p className="mt-1 text-sm text-muted-foreground">Why: {q.reason}</p>}
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {q.items.map((i, idx) => (
                      <li key={i.id ?? idx} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          {i.description}
                          {i.quantity !== 1 && <span className="text-muted-foreground"> × {i.quantity}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(i.quantity * i.unit_price, cur)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {q.schedule_impact_days ? `Adds ${q.schedule_impact_days} day${Math.abs(q.schedule_impact_days) === 1 ? "" : "s"} · ` : ""}
                    {q.valid_until && q.status === "sent" ? `Valid until ${formatDate(q.valid_until)} · ` : ""}
                    {q.sent_at ? `Sent ${formatDate(q.sent_at)}` : `Drafted ${formatDate(q.created_at)}`}
                    {q.decided_at ? ` · ${q.status === "accepted" ? "accepted" : q.status === "declined" ? "declined" : "closed"} ${formatDate(q.decided_at)}` : ""}
                    {q.decision_note ? ` · "${q.decision_note}"` : ""}
                  </p>
                  {canQuote && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {q.status === "draft" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setEditing(q)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              void call(
                                () => supabase.rpc("send_project_quote", { _quote_id: q.id }),
                                q.kind === "change" && !isAdmin ? "Sent to an admin for sign-off" : "Sent to the client",
                              )
                            }
                          >
                            {q.kind === "change" && !isAdmin ? "Send for sign-off" : "Send to client"}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void call(() => supabase.from("project_quotes").delete().eq("id", q.id), "Draft deleted")}>
                            Delete draft
                          </Button>
                        </>
                      )}
                      {q.status === "pending_approval" && isAdmin && (
                        <>
                          <Button size="sm" onClick={() => void call(() => supabase.rpc("review_change_request", { _quote_id: q.id, _approve: true }), "Signed off and sent to the client")}>
                            Sign off and send
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeciding({ quote: q, accept: false })}>
                            Don't approve
                          </Button>
                        </>
                      )}
                      {q.status === "sent" && (
                        <>
                          <Button size="sm" onClick={() => setSharing(q)}>
                            Share link
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeciding({ quote: q, accept: true })}>
                            Record acceptance
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDeciding({ quote: q, accept: false })}>
                            Record decline
                          </Button>
                        </>
                      )}
                      {(q.status === "sent" || q.status === "pending_approval") && (
                        <Button size="sm" variant="ghost" onClick={() => void call(() => supabase.rpc("withdraw_project_quote", { _quote_id: q.id }), "Withdrawn")}>
                          Withdraw
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <ShareQuoteDialog
        open={!!sharing}
        onOpenChange={(v) => !v && setSharing(null)}
        quote={sharing ? { id: sharing.id, label: quoteLabel(project.ref, sharing) } : null}
        defaultEmail={project.contact_email ?? null}
      />

      {editing && (
        <QuoteEditor
          project={project}
          quote={"id" in editing ? editing : null}
          kind={editing.kind}
          defaultCurrency={baseCurrency}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {deciding && (
        <DecisionDialog
          label={quoteLabel(project.ref, deciding.quote)}
          accept={deciding.accept}
          adminReview={deciding.quote.status === "pending_approval"}
          onClose={() => setDeciding(null)}
          onConfirm={async (note) => {
            const q = deciding.quote;
            setDeciding(null);
            if (q.status === "pending_approval") {
              await call(() => supabase.rpc("review_change_request", { _quote_id: q.id, _approve: false, _note: note }), "Change request not approved");
            } else {
              await call(
                () => supabase.rpc("decide_project_quote", { _quote_id: q.id, _accept: deciding.accept, _note: note }),
                deciding.accept ? "Recorded as accepted" : "Recorded as declined",
              );
            }
          }}
        />
      )}
    </Card>
  );
}

type Line = { description: string; quantity: string; unit_price: string };

function QuoteEditor({
  project,
  quote,
  kind,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  project: { id: string; ref: string };
  quote: Quote | null;
  kind: Quote["kind"];
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { enabled, format: fmt } = useCurrency();
  const [title, setTitle] = useState(quote?.title ?? "");
  const [reason, setReason] = useState(quote?.reason ?? "");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [currency, setCurrency] = useState(quote?.currency ?? defaultCurrency);
  const [days, setDays] = useState(quote?.schedule_impact_days != null ? String(quote.schedule_impact_days) : "");
  const [validUntil, setValidUntil] = useState(quote?.valid_until ?? "");
  const [lines, setLines] = useState<Line[]>(
    quote?.items.length ? quote.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price) })) : [{ description: "", quantity: "1", unit_price: "" }],
  );
  const [saving, setSaving] = useState(false);
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const isChange = kind === "change";

  const save = async () => {
    const valid = lines.filter((l) => l.description.trim());
    if (valid.length === 0) return toast.error("Add at least one line");
    if (valid.some((l) => !(Number(l.quantity) > 0) || Number(l.unit_price) < 0 || l.unit_price === "")) return toast.error("Each line needs a quantity above 0 and a price");
    if (isChange && !reason.trim()) return toast.error("Say why the change is needed");
    setSaving(true);
    const fields = {
      title: title.trim(),
      reason: isChange ? reason.trim() : null,
      notes: notes.trim() || null,
      currency,
      schedule_impact_days: isChange && days ? Number(days) : null,
      valid_until: !isChange && validUntil ? validUntil : null,
    };
    let id = quote?.id;
    if (quote) {
      const { error } = await supabase.from("project_quotes").update(fields).eq("id", quote.id);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      await supabase.from("project_quote_items").delete().eq("quote_id", quote.id);
    } else {
      const { data, error } = await supabase.from("project_quotes").insert({ ...fields, job_id: project.id, kind, created_by: user?.id }).select("id").single();
      if (error || !data) {
        setSaving(false);
        return toast.error(error?.message ?? "Couldn't save");
      }
      id = data.id;
    }
    const { error: itemsErr } = await supabase
      .from("project_quote_items")
      .insert(valid.map((l, i) => ({ quote_id: id!, description: l.description.trim(), quantity: Number(l.quantity), unit_price: Number(l.unit_price), position: i })));
    setSaving(false);
    if (itemsErr) return toast.error(itemsErr.message);
    toast.success("Saved as a draft. Send it when it's ready.");
    onSaved();
  };

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{quote ? `Edit ${quoteLabel(project.ref, quote)}` : isChange ? "New change request" : "New quote"}</DialogTitle>
          <DialogDescription>
            {isChange ? "For extra work or cost after the project was approved. An admin signs it off before the client sees it." : "The client sees the lines and total and accepts or declines."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="f-quote-title">{isChange ? "What's changing" : "Title"}</Label>
            <Input id="f-quote-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={isChange ? "e.g. Replace burnt-out motor" : "e.g. Spindle rebuild"} />
          </div>
          {isChange && (
            <div>
              <Label htmlFor="f-quote-reason">Why it's needed</Label>
              <Textarea id="f-quote-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={2000} placeholder="What you found, and why the original scope doesn't cover it" />
            </div>
          )}
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Lines</legend>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_4.5rem_6.5rem_2.5rem] items-center gap-2">
                  <Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Work or part" />
                  <Input aria-label={`Line ${i + 1} quantity`} type="number" min={0.01} step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <Input aria-label={`Line ${i + 1} price`} type="number" min={0} step={0.01} value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} placeholder="Price" />
                  <Button type="button" size="icon" variant="ghost" className="h-10 w-10" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { description: "", quantity: "1", unit_price: "" }])}>
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Add line
              </Button>
              <span className="text-sm">
                Total <span className="font-semibold tabular-nums">{fmt(total, currency)}</span> <span className="text-muted-foreground">before tax</span>
              </span>
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="f-quote-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="f-quote-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([defaultCurrency, ...enabled])].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isChange ? (
              <div>
                <Label htmlFor="f-quote-days">Extra days needed (optional)</Label>
                <Input id="f-quote-days" type="number" min={-365} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
            ) : (
              <div>
                <Label htmlFor="f-quote-valid">Valid until (optional)</Label>
                <DatePickerInput id="f-quote-valid" value={validUntil} onChange={setValidUntil} />
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="f-quote-notes">Notes for the client (optional)</Label>
            <Textarea id="f-quote-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecisionDialog({
  label,
  accept,
  adminReview,
  onClose,
  onConfirm,
}: {
  label: string;
  accept: boolean;
  adminReview: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const title = adminReview ? `Don't approve ${label}?` : accept ? `Record ${label} as accepted` : `Record ${label} as declined`;
  const description = adminReview
    ? "The change request goes back to whoever raised it, with your reason."
    : "Use this when the client told you in person, by phone or by email. It's recorded under your name.";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-decision-note">{adminReview ? "Reason" : "Note (optional)"}</Label>
          <Textarea id="f-decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder={accept ? "e.g. Agreed by phone with Jo" : "e.g. Too expensive, wants a cheaper option"} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(note.trim())} disabled={adminReview && !note.trim()} variant={accept ? "default" : "destructive"}>
            {adminReview ? "Don't approve" : accept ? "Record acceptance" : "Record decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
