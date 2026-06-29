import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invoiceSchema } from "@/lib/schemas/invoice";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";
import { useCurrency } from "@/hooks/useCurrency";
import InvoicePdfPreview from "@/components/invoices/InvoicePdfPreview";
import type { WorkshopDetails } from "@/lib/invoicePdf";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export default function InvoiceCreate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("jobId");
  const { currency: baseCurrency, enabled: enabledCurrencies, format: fmt } = useCurrency();

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState<string>(baseCurrency);
  const [fxRate, setFxRate] = useState<number>(1);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxFetchedAt, setFxFetchedAt] = useState<string | null>(null);

  // Keep currency aligned with the workshop's base until the user picks one
  const [userPickedCurrency, setUserPickedCurrency] = useState(false);
  useEffect(() => {
    if (!userPickedCurrency) setCurrency(baseCurrency);
  }, [baseCurrency, userPickedCurrency]);

  // Auto-fetch FX rate whenever an invoice currency differs from base
  useEffect(() => {
    if (!currency || !baseCurrency) return;
    if (currency === baseCurrency) {
      setFxRate(1);
      setFxFetchedAt(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setFxLoading(true);
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${currency}`);
        const json = await res.json();
        const rate = json?.rates?.[baseCurrency];
        if (!cancelled && typeof rate === "number" && rate > 0) {
          setFxRate(Number(rate.toFixed(6)));
          setFxFetchedAt(json?.time_last_update_utc || new Date().toISOString());
        } else if (!cancelled) {
          toast.error(`Couldn't fetch live rate for ${currency} → ${baseCurrency}. Enter manually.`);
        }
      } catch {
        if (!cancelled) toast.error("Live FX lookup failed. Enter rate manually.");
      } finally {
        if (!cancelled) setFxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currency, baseCurrency]);

  const [workshop, setWorkshop] = useState<WorkshopDetails | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      // Workshop company details for the live preview
      const { data: ws } = await supabase
        .from("workshop_settings")
        .select("workshop_name, address, phone, contact_email, logo_url")
        .eq("id", 1)
        .maybeSingle();
      if (ws) setWorkshop(ws as WorkshopDetails);

      // Load clients list
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
      if (roles?.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", roles.map((r) => r.user_id));
        setClients(profiles?.map((p) => ({ id: p.id, full_name: p.full_name || "Unknown" })) || []);
      }

      if (jobId) {
        const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
        if (job) {
          if (job.client_id) {
            setClientId(job.client_id);
            const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", job.client_id).single();
            setClientName(profile?.full_name || "");
          }
          setItems([{ description: job.title, quantity: 1, unit_price: 0 }]);
        }
      }
    };
    load();
  }, [jobId]);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const handleSave = async () => {
    const validation = invoiceSchema.safeParse({
      client_id: clientId,
      due_date: dueDate || undefined,
      tax_rate: taxRate,
      items: items.map((i) => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })),
    });
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Please fix form errors");
      return;
    }

    setSaving(true);
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        client_id: clientId,
        job_id: jobId || null,
        status: "draft",
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        due_date: dueDate || null,
        notes: notes || null,
        currency,
        fx_rate: currency === baseCurrency ? 1 : (fxRate > 0 ? fxRate : 1),
      } as any)
      .select("id")
      .single();

    if (error || !inv) { toast.error(error?.message || "Failed"); setSaving(false); return; }

    const invoiceItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        invoice_id: inv.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.quantity * i.unit_price,
      }));

    if (invoiceItems.length) {
      await supabase.from("invoice_items").insert(invoiceItems);
    }

    toast.success("Invoice created as draft");
    setSaving(false);
    navigate(-1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Invoice</h2>
          <p className="text-muted-foreground">New draft invoice{jobId ? " linked to job" : ""}</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <DatePickerInput value={dueDate} onChange={setDueDate} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Tax Rate (%)</Label>
                <Input type="number" min={0} step={0.5} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => { setUserPickedCurrency(true); setCurrency(v); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {enabledCurrencies.map((c) => (
                      <SelectItem key={c} value={c}>{c}{c === baseCurrency ? " (base)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {currency !== baseCurrency && (
                <div>
                  <Label>Exchange rate to {baseCurrency}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    value={fxRate}
                    onChange={(e) => setFxRate(Number(e.target.value))}
                    placeholder={fxLoading ? "Fetching…" : "e.g. 0.00062"}
                    disabled={fxLoading}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fxLoading
                      ? "Fetching live rate…"
                      : <>1 {currency} = {fxRate || 0} {baseCurrency}{fxFetchedAt ? " · live rate" : " · manual"}</>}
                  </p>
                </div>
              )}
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addItem}><Plus className="mr-2 h-4 w-4" />Add Item</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Unit Price</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Item description" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(item.quantity * item.unit_price, currency)}</TableCell>
                    <TableCell>
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmt(subtotal, currency)}</span></div>
            <div className="flex justify-between text-sm"><span>Tax ({taxRate}%)</span><span>{fmt(taxAmount, currency)}</span></div>
            <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{fmt(total, currency)}</span></div>
            {currency !== baseCurrency && (
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Equivalent in {baseCurrency}</span>
                <span>{fmt(total * (fxRate > 0 ? fxRate : 1), baseCurrency)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save as Draft"}
        </Button>
      </div>
    </DashboardLayout>
  );
}
