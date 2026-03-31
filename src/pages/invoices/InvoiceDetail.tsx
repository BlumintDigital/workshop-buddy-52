import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, FileDown } from "lucide-react";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";
import { generateInvoicePDF } from "@/lib/invoicePdf";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", sent: "secondary", paid: "default", overdue: "destructive", cancelled: "destructive",
};

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<any>(null);
  const [clientName, setClientName] = useState("—");
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const canEdit = (role === "admin" || role === "manager") && invoice?.status === "draft";
  const canManage = role === "admin" || role === "manager";

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).single();
      if (!inv) { toast.error("Invoice not found"); navigate(-1); return; }
      setInvoice(inv);

      if (inv.client_id) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", inv.client_id).single();
        setClientName(profile?.full_name || "Unknown");
      }

      const { data: lineItems } = await supabase.from("invoice_items").select("*").eq("invoice_id", id).order("id");
      setItems(
        (lineItems || []).map((i: any) => ({
          id: i.id,
          description: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.unit_price),
        }))
      );
    };
    load();
  }, [id]);

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const taxAmount = subtotal * ((invoice?.tax_rate ?? 0) / 100);
  const total = subtotal + taxAmount;

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof LineItem, value: string | number) =>
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  const handleSave = async () => {
    if (!invoice) return;
    if (items.every((i) => !i.description.trim())) { toast.error("Add at least one line item"); return; }
    setSaving(true);

    const { error: invError } = await supabase.from("invoices").update({
      subtotal,
      tax_amount: taxAmount,
      total,
      due_date: invoice.due_date || null,
      notes: invoice.notes || null,
    }).eq("id", invoice.id);

    if (invError) { toast.error(invError.message); setSaving(false); return; }

    // Delete existing items and reinsert
    await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);
    const toInsert = items
      .filter((i) => i.description.trim())
      .map((i) => ({
        invoice_id: invoice.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total: i.quantity * i.unit_price,
      }));
    if (toInsert.length) await supabase.from("invoice_items").insert(toInsert);

    toast.success("Invoice saved");
    setSaving(false);
    setInvoice({ ...invoice, subtotal, tax_amount: taxAmount, total });
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      await generateInvoicePDF({ invoice, clientName, items });
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  if (!invoice) return <DashboardLayout><p className="p-8 text-muted-foreground">Loading...</p></DashboardLayout>;

  const backPath = role === "client" ? "/client/invoices" : role === "manager" ? "/manager/invoices" : "/admin/invoices";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to Invoices
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{invoice.invoice_number}</h2>
            <p className="text-muted-foreground">
              Client: <span className="font-medium text-foreground">{clientName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={statusColors[invoice.status]}>{invoice.status}</Badge>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading}>
              <FileDown className="mr-2 h-4 w-4" />{downloading ? "Generating..." : "PDF"}
            </Button>
          </div>
        </div>

        {/* Invoice meta */}
        <Card>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Due Date</Label>
              {canEdit ? (
                <Input
                  type="date"
                  value={invoice.due_date || ""}
                  onChange={(e) => setInvoice({ ...invoice, due_date: e.target.value })}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{invoice.due_date || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tax Rate</Label>
              {canEdit ? (
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={invoice.tax_rate ?? 0}
                  onChange={(e) => setInvoice({ ...invoice, tax_rate: Number(e.target.value) })}
                  className="mt-1 w-24"
                />
              ) : (
                <p className="mt-1 text-sm">{invoice.tax_rate ?? 0}%</p>
              )}
            </div>
            {canManage && (
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={invoice.status}
                  onValueChange={async (v) => {
                    const update: any = { status: v };
                    if (v === "paid") update.paid_at = new Date().toISOString();
                    const { error } = await supabase.from("invoices").update(update).eq("id", invoice.id);
                    if (error) { toast.error(error.message); return; }
                    setInvoice({ ...invoice, status: v });
                    toast.success(`Status updated to ${v}`);
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-2 h-4 w-4" />Add Item
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20 text-right">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit Price</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  {canEdit && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-6 text-muted-foreground">No line items</TableCell></TableRow>
                ) : items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {canEdit ? (
                        <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Item description" />
                      ) : item.description}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="w-16 text-right ml-auto" />
                      ) : item.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} className="w-24 text-right ml-auto" />
                      ) : `$${Number(item.unit_price).toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-right font-medium">${(item.quantity * item.unit_price).toFixed(2)}</TableCell>
                    {canEdit && (
                      <TableCell>
                        {items.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span>Tax ({invoice.tax_rate ?? 0}%)</span><span>${taxAmount.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>${total.toFixed(2)}</span></div>
          </CardContent>
        </Card>

        {/* Notes */}
        {(canEdit || invoice.notes) && (
          <Card>
            <CardContent className="pt-6">
              <Label>Notes</Label>
              {canEdit ? (
                <Textarea
                  value={invoice.notes || ""}
                  onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
                  placeholder="Optional notes"
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{invoice.notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        {canEdit && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
}
