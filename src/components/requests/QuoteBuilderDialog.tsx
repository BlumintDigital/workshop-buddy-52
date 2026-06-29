import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";

interface LineItem { description: string; quantity: number; unit_price: number; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requestId: string | null;
  requestTitle?: string;
  onSubmitted: () => void;
}

export default function QuoteBuilderDialog({ open, onOpenChange, requestId, requestTitle, onSubmitted }: Props) {
  const { currency: baseCurrency, format: fmt } = useCurrency();
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [notes, setNotes] = useState("");
  const [expires, setExpires] = useState("");
  const [currency, setCurrency] = useState(baseCurrency);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !requestId) return;
    setCurrency(baseCurrency);
    // Pre-fill from any existing quote items
    (async () => {
      const { data } = await supabase
        .from("request_quote_items")
        .select("description, quantity, unit_price")
        .eq("request_id", requestId);
      if (data && data.length) {
        setItems(data.map((d: any) => ({
          description: d.description,
          quantity: Number(d.quantity),
          unit_price: Number(d.unit_price),
        })));
      } else {
        setItems([{ description: requestTitle || "", quantity: 1, unit_price: 0 }]);
      }
      const { data: req } = await supabase
        .from("client_requests")
        .select("quoted_notes, quote_expires_at, quoted_currency")
        .eq("id", requestId)
        .maybeSingle();
      setNotes((req as any)?.quoted_notes || "");
      setExpires((req as any)?.quote_expires_at ? String((req as any).quote_expires_at).slice(0, 10) : "");
      if ((req as any)?.quoted_currency) setCurrency((req as any).quoted_currency);
    })();
  }, [open, requestId, baseCurrency, requestTitle]);

  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  const submit = async () => {
    if (!requestId) return;
    const clean = items.filter((i) => i.description.trim());
    if (!clean.length) { toast.error("Add at least one line item"); return; }
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_quote", {
      _request_id: requestId,
      _currency: currency,
      _notes: notes || (null as any),
      _expires_at: expires ? new Date(expires).toISOString() : (null as any),
      _items: clean as any,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Quote sent to the client");
    onOpenChange(false);
    onSubmitted();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Build &amp; send quote</DialogTitle>
          <DialogDescription>
            The client will see this quote in their portal and can approve or decline it. No invoice or job is created yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20">Qty</TableHead>
                  <TableHead className="w-32">Unit price</TableHead>
                  <TableHead className="w-32 text-right">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input
                        value={it.description}
                        onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                        placeholder="What's included"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min="0" step="0.01"
                        value={it.quantity}
                        onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min="0" step="0.01"
                        value={it.unit_price}
                        onChange={(e) => setItems((arr) => arr.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt((Number(it.quantity) || 0) * (Number(it.unit_price) || 0), currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t p-3">
              <Button variant="outline" size="sm" onClick={() => setItems((a) => [...a, { description: "", quantity: 1, unit_price: 0 }])}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
              <p className="text-sm">
                Total: <span className="font-semibold tabular-nums">{fmt(total, currency)}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} />
            </div>
            <div>
              <Label>Quote expires</Label>
              <DatePickerInput value={expires} onChange={setExpires} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Notes for the client</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Warranty, timing, exclusions…" />
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? "Sending…" : "Send quote to client"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
