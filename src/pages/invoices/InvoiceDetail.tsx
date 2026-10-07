import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { AccountingSyncStatus } from "@/components/invoices/AccountingSyncStatus";
import { kickAccountingSync, loadInvoiceAccounting, PROVIDER_LABEL, type InvoiceAccounting } from "@/lib/accounting";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, FileDown, ExternalLink, Link2, Bell, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { clientFriendlyInvoiceStatus, clientStatusTone } from "@/lib/invoiceStatus";

import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";
import { friendlyErrorMessage, friendlyErrorMessageSync } from "@/lib/friendlyError";
import { sendEmail, invoiceSentEmailHtml } from "@/lib/email";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useCurrency } from "@/hooks/useCurrency";
import InvoicePdfVersions from "@/components/invoices/InvoicePdfVersions";
import { DiscountField } from "@/components/invoices/DiscountField";
import { discountColumns, discountLabel, invoiceTotals, type InvoiceDiscount } from "@/lib/invoiceTotals";
import { useBreadcrumbLabel } from "@/lib/breadcrumbs";
import { useWorkshopDetails } from "@/hooks/useWorkshopDetails";

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
  const { format: fmt } = useCurrency();
  const { workshop } = useWorkshopDetails();

  const [invoice, setInvoice] = useState<any>(null);
  useBreadcrumbLabel(`/invoices/${id}`, invoice?.invoice_number);
  const [clientName, setClientName] = useState("—");
  const [items, setItems] = useState<LineItem[]>([]);
  // Snapshot of last loaded/saved editable fields — used to warn about unsaved edits.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [sourceRequestId, setSourceRequestId] = useState<string | null>(null);

  const { has } = usePermissions();
  // Admins, managers and staff with the Billing permission run invoices.
  const canManage = role === "admin" || role === "manager" || (role === "staff" && has("billing"));
  const canEdit = canManage && invoice?.status === "draft";

  // Where this invoice stands in the connected accounting system, if any.
  const [accounting, setAccounting] = useState<InvoiceAccounting | null>(null);
  const refreshAccounting = useCallback(() => {
    if (id && canManage) void loadInvoiceAccounting(id).then(setAccounting);
  }, [id, canManage]);
  useEffect(() => refreshAccounting(), [refreshAccounting]);
  // After a change: push it now, then show where it landed.
  const pushToAccounting = () => {
    if (!accounting) return;
    kickAccountingSync();
    window.setTimeout(refreshAccounting, 3000);
  };
  const isClient = role === "client";

  const editableSnapshot = (inv: any, lineItems: LineItem[]) =>
    JSON.stringify({
      due_date: inv?.due_date ?? null,
      tax_rate: inv?.tax_rate ?? 0,
      discount_type: inv?.discount_type ?? null,
      discount_value: Number(inv?.discount_value ?? 0),
      discount_reason: inv?.discount_reason ?? null,
      notes: inv?.notes ?? null,
      stripe_payment_url: inv?.stripe_payment_url ?? null,
      payment_instructions: inv?.payment_instructions ?? null,
      items: lineItems,
    });

  const isDirty = savedSnapshot !== null && invoice !== null && editableSnapshot(invoice, items) !== savedSnapshot;

  // Warn before leaving the page with unsaved invoice edits.
  useEffect(() => {
    if (!isDirty || !canManage) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, canManage]);


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
      const mappedItems = (lineItems || []).map((i: any) => ({
        id: i.id,
        description: i.description,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
      }));
      setItems(mappedItems);
      setSavedSnapshot(editableSnapshot(inv, mappedItems));

      // Trace back to originating client request via the linked job (admin/manager only).
      if (inv.job_id && (role === "admin" || role === "manager")) {
        const { data: job } = await supabase.from("jobs").select("source_request_id").eq("id", inv.job_id).maybeSingle();
        setSourceRequestId((job as any)?.source_request_id ?? null);
      }

    };
    load();
  }, [id]);

  const discount: InvoiceDiscount = {
    type: invoice?.discount_type ?? null,
    value: Number(invoice?.discount_value ?? 0),
    reason: invoice?.discount_reason ?? "",
  };
  const lineTotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const { subtotal, discountAmount, taxAmount, total } = invoiceTotals(lineTotal, invoice?.tax_rate ?? 0, discount);
  const setDiscount = (d: InvoiceDiscount) =>
    setInvoice({ ...invoice, discount_type: d.type, discount_value: d.type ? d.value : 0, discount_reason: d.reason ?? null });

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof LineItem, value: string | number) =>
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  const handleSave = async () => {
    if (!invoice) return;
    if (items.every((i) => !i.description.trim())) { toast.error("Add at least one line item"); return; }
    if (discount.type === "percent" && discount.value > 100) { toast.error("A percentage discount can't be more than 100%"); return; }
    setSaving(true);

    const discountCols = discountColumns(subtotal, discount);
    const { error: invError } = await supabase.from("invoices").update({
      subtotal,
      tax_rate: invoice.tax_rate ?? 0,
      tax_amount: taxAmount,
      total,
      ...discountCols,
      due_date: invoice.due_date || null,
      notes: invoice.notes || null,
      stripe_payment_url: invoice.stripe_payment_url || null,
      payment_instructions: invoice.payment_instructions || null,
    }).eq("id", invoice.id);


    if (invError) {
      toast.error(friendlyErrorMessageSync(invError, "Couldn't save invoice changes."));
      setSaving(false);
      return;
    }

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
    setInvoice({ ...invoice, subtotal, tax_amount: taxAmount, total, ...discountCols });
    setSavedSnapshot(editableSnapshot(invoice, items));
  };

  const handleDelete = async () => {
    if (!invoice) return;
    setDeleting(true);
    await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);
    const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
    if (error) {
      toast.error(friendlyErrorMessageSync(error, "Couldn't delete this invoice."));
      setDeleting(false);
      return;
    }
    toast.success("Invoice deleted");
    const path = role === "client" ? "/client/invoices" : role === "manager" ? "/manager/invoices" : role === "staff" ? "/invoices" : "/admin/invoices";
    navigate(path);
  };

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      // The PDF library is large; load it only when someone downloads a PDF.
      const { generateInvoicePDF } = await import("@/lib/invoicePdf");
      await generateInvoicePDF({ invoice, clientName, items });
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(friendlyErrorMessageSync(e, "Couldn't generate the PDF. Please retry or check your browser's download settings."));
    } finally {
      setDownloading(false);
    }
  };

  const notifyClient = async (title: string, body: string, skipEmail = false) => {
    if (!invoice?.client_id) {
      toast.error("This invoice has no client to notify.");
      return;
    }
    setNotifying(true);
    const link = `/client/invoices/${invoice.id}`;

    // 1) In-app notification — primary, always attempt
    let inAppOk = false;
    try {
      const { error } = await supabase.from("notifications").insert({
        user_id: invoice.client_id, title, message: body, link, read: false,
      });
      inAppOk = !error;
    } catch { /* ignore */ }

    // 2) Email — via send-email edge function (server resolves recipient)
    let emailOk = false;
    if (!skipEmail) try {
      await sendEmail({
        to_user_id: invoice.client_id,
        subject: title,
        html: invoiceSentEmailHtml(
          invoice.invoice_number,
          Number(invoice.total) || 0,
          invoice.currency || "USD",
          `${window.location.origin}${link}`,
        ),
      });
      emailOk = true;
    } catch { /* swallow */ }

    // 3) Push — best-effort with 12s timeout so the button never hangs
    let pushSent = 0;
    try {
      const pushPromise = supabase.functions.invoke("send-push", {
        body: { user_ids: [invoice.client_id], title, body, url: link },
      });
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000));
      const res: any = await Promise.race([pushPromise, timeout]);
      if (!res?.error) pushSent = res?.data?.sent ?? 0;
    } catch { /* timeout or function error */ }

    setNotifying(false);

    const channels: string[] = [];
    if (inAppOk) channels.push("in-app");
    if (emailOk) channels.push("email");
    if (pushSent > 0) channels.push(`push (${pushSent})`);
    if (skipEmail && accounting) channels.push(`email from ${PROVIDER_LABEL[accounting.provider]}`);
    if (channels.length === 0) toast.error("Couldn't notify the client. Please try again.");
    else toast.success(`Client notified via ${channels.join(", ")}.`);
  };

  // Explicit Send/Resend to client: marks status `sent`, then notifies via in-app + email (+ push best-effort).
  const sendInvoiceToClient = async () => {
    if (!invoice?.client_id) { toast.error("This invoice has no client to send to."); return; }
    if (sending) return;
    setSending(true);
    try {
      if (invoice.status === "draft") {
        const { error } = await supabase.from("invoices").update({ status: "sent" }).eq("id", invoice.id);
        if (error) { toast.error(friendlyErrorMessageSync(error, "Couldn't update invoice status.")); return; }
        setInvoice({ ...invoice, status: "sent" });
      }
      // The connected accounting system emails it when it's set to; Shoplane still notifies in the app.
      await notifyClient(
        `Invoice ${invoice.invoice_number}`,
        `Total: ${fmt(total, invoice.currency)} — view and pay online.`,
        accounting?.send_from === "provider",
      );
      pushToAccounting();
    } finally {
      setSending(false);
    }
  };

  // Client confirms they have paid out-of-band. Admin/manager still needs to verify.
  const [markingPaid, setMarkingPaid] = useState(false);
  const clientMarkPaid = async () => {
    if (!invoice) return;
    setMarkingPaid(true);
    try {
      const { data, error } = await supabase.rpc("client_mark_invoice_paid", { _invoice_id: invoice.id });
      if (error) { toast.error(friendlyErrorMessageSync(error, "Couldn't submit your payment notice.")); return; }
      setInvoice({ ...invoice, client_marked_paid_at: data });
      toast.success("Thanks — we'll confirm shortly.");
    } finally {
      setMarkingPaid(false);
    }
  };

  // Admin/manager confirms payment was received → status becomes paid.
  const [confirmingPaid, setConfirmingPaid] = useState(false);
  const markPaymentReceived = async () => {
    if (!invoice) return;
    setConfirmingPaid(true);
    try {
      const paidAt = new Date().toISOString();
      const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: paidAt }).eq("id", invoice.id);
      if (error) { toast.error(friendlyErrorMessageSync(error, "Couldn't mark as paid.")); return; }
      setInvoice({ ...invoice, status: "paid", paid_at: paidAt });
      toast.success("Marked as paid.");
      pushToAccounting();
      if (invoice.client_id) {
        sendEmail({
          to_user_id: invoice.client_id,
          subject: `Payment received — ${invoice.invoice_number}`,
          html: invoiceSentEmailHtml(
            invoice.invoice_number,
            total,
            invoice.currency ?? "USD",
            `${window.location.origin}/invoices/${invoice.id}`,
          ),
        }).catch(() => {});
      }
    } finally {
      setConfirmingPaid(false);
    }
  };




  if (!invoice) return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl" aria-busy="true">
        <h1 className="sr-only">Loading invoice…</h1>
        <Skeleton className="h-8 w-28" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </DashboardLayout>
  );

  const backPath = role === "client" ? "/client/invoices" : role === "manager" ? "/manager/invoices" : role === "staff" ? "/invoices" : "/admin/invoices";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to Invoices
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:max-w-[50%] sm:shrink-0">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{invoice.invoice_number}</h1>
            <p className="text-sm text-muted-foreground">
              Client: <span className="font-medium text-foreground">{clientName}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:min-w-0 sm:flex-1 sm:justify-end">
            {isClient ? (
              <Badge variant={clientStatusTone[invoice.status] || "outline"}>
                {clientFriendlyInvoiceStatus(invoice.status, invoice.client_marked_paid_at)}
              </Badge>
            ) : (
              <Badge variant={statusColors[invoice.status]}>{invoice.status}</Badge>
            )}

            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={downloading}>
              <FileDown className="mr-2 h-4 w-4" />{downloading ? "Generating..." : "PDF"}
            </Button>
            {canManage && invoice.client_id && invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <Button
                size="sm"
                disabled={sending || notifying}
                onClick={() => void sendInvoiceToClient()}
              >
                <Send className="mr-2 h-4 w-4" />
                {sending
                  ? "Sending..."
                  : invoice.status === "draft" ? "Send to client" : "Resend to client"}
              </Button>
            )}
            {canManage && invoice.client_id && invoice.status !== "draft" && (
              <Button
                variant="outline"
                size="sm"
                disabled={notifying || sending}
                onClick={() =>
                  void notifyClient(
                    `Invoice ${invoice.invoice_number} reminder`,
                    `Total: ${fmt(total, invoice.currency)} — view and pay online.`,
                  )
                }
              >
                <Bell className="mr-2 h-4 w-4" />{notifying ? "Sending..." : "Remind client"}
              </Button>
            )}

            {canManage && invoice.status !== "paid" && invoice.status !== "draft" && invoice.status !== "cancelled" && (
              <Button
                variant="default"
                size="sm"
                disabled={confirmingPaid}
                onClick={() => void markPaymentReceived()}
              >
                {confirmingPaid ? "Saving..." : invoice.client_marked_paid_at ? "Confirm payment received" : "Mark payment received"}
              </Button>
            )}

            {isClient && (invoice.status === "sent" || invoice.status === "overdue") && !invoice.client_marked_paid_at && (
              <Button
                size="sm"
                disabled={markingPaid}
                onClick={() => void clientMarkPaid()}
              >
                {markingPaid ? "Submitting..." : "I've paid"}
              </Button>
            )}


            {role === "admin" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    <Trash2 className="mr-2 h-4 w-4" />{deleting ? "Deleting..." : "Delete"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {invoice.invoice_number}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>


        {canManage && sourceRequestId && invoice.job_id && (
          <div className="rounded-lg border border-border bg-primary-soft px-4 py-3 text-sm">
            Billed for a project that started as a client request.{" "}
            <Link to={`/projects/${invoice.job_id}`} className="font-medium text-primary hover:underline">
              View project →
            </Link>
          </div>
        )}

        {canManage && accounting && (
          <AccountingSyncStatus info={accounting} invoiceId={invoice.id} invoiceStatus={invoice.status} isAdmin={role === "admin"} onChanged={refreshAccounting} />
        )}

        {canManage && invoice.client_marked_paid_at && invoice.status !== "paid" && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>The client marked this invoice as paid on {new Date(invoice.client_marked_paid_at).toLocaleString()}.</span>
            <Button size="sm" onClick={() => void markPaymentReceived()} disabled={confirmingPaid}>
              {confirmingPaid ? "Saving..." : "Confirm payment received"}
            </Button>
          </div>
        )}





        {/* Invoice meta */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="f-due-date" className="text-xs text-muted-foreground">Due Date</Label>
                {canEdit ? (
                  <DatePickerInput id="f-due-date"
                    value={invoice.due_date || ""}
                    onChange={(v) => setInvoice({ ...invoice, due_date: v })}
                    className="mt-1"
                  />
                ) : (
                  <p className="mt-1 text-sm">{invoice.due_date || "—"}</p>
                )}
              </div>
              <div>
                <Label htmlFor="f-tax-rate" className="text-xs text-muted-foreground">Tax Rate</Label>
                {canEdit ? (
                  <Input id="f-tax-rate"
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
                      if (error) { toast.error(friendlyErrorMessageSync(error, "Couldn't update invoice status.")); return; }
                      setInvoice({ ...invoice, status: v });
                      toast.success(`Status updated to ${v}`);
                      pushToAccounting();
                      if (v === "sent" && invoice.client_id) {
                        sendEmail({
                          to_user_id: invoice.client_id,
                          subject: `Invoice ${invoice.invoice_number}`,
                          html: invoiceSentEmailHtml(
                            invoice.invoice_number,
                            total,
                            invoice.currency ?? "USD",
                            `${window.location.origin}/invoices/${invoice.id}`
                          ),
                        }).catch(() => {});
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {/* `draft` and `sent` are controlled by the explicit Send to client button to avoid confusion,
                          but the current one is still listed (disabled) so the trigger shows it. */}
                      {(["draft", "sent"].includes(invoice.status) ? [invoice.status] : []).map((s) => (
                        <SelectItem key={s} value={s} disabled>{s}</SelectItem>
                      ))}
                      {["paid", "overdue", "cancelled"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}

                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Payment link — editable by admin/manager, visible as button to client */}
            {canManage && (
              <div>
                <Label htmlFor="f-payment-link" className="text-xs text-muted-foreground flex items-center gap-1">
                  <Link2 className="h-3 w-3" />Payment Link
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input id="f-payment-link"
                    value={invoice.stripe_payment_url || ""}
                    onChange={(e) => setInvoice({ ...invoice, stripe_payment_url: e.target.value })}
                    placeholder="https://buy.stripe.com/… or any payment URL"
                    className="flex-1"
                  />
                  {invoice.stripe_payment_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={invoice.stripe_payment_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Paste any payment URL — shown to the client as a "Pay Now" button once the invoice is sent.</p>
              </div>
            )}

            {/* Payment instructions — used when no payment link is available (e.g. bank transfer) */}
            {canManage && (
              <div>
                <Label htmlFor="f-payment-instructions" className="text-xs text-muted-foreground">Payment Instructions</Label>
                <Textarea id="f-payment-instructions"
                  value={invoice.payment_instructions || ""}
                  onChange={(e) => setInvoice({ ...invoice, payment_instructions: e.target.value })}
                  placeholder="e.g. Bank transfer to Acme Ltd, Sort code 12-34-56, Account 12345678. Reference: invoice number."
                  className="mt-1 min-h-[80px]"
                />
                <p className="text-xs text-muted-foreground mt-1">Shown to the client when no payment link is set. Save the invoice to apply changes.</p>
              </div>
            )}

            {isClient && !invoice.stripe_payment_url && invoice.payment_instructions && invoice.status !== "paid" && (
              <div className="rounded-lg border border-border bg-primary-soft px-4 py-3">
                <p className="text-xs font-medium text-foreground mb-1">Payment instructions</p>
                <p className="text-sm whitespace-pre-wrap text-foreground/80">{invoice.payment_instructions}</p>
              </div>
            )}

            {isClient && invoice.client_marked_paid_at && invoice.status !== "paid" && (
              <div className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
                You've let us know you paid on {new Date(invoice.client_marked_paid_at).toLocaleString()}. We'll confirm shortly.
              </div>
            )}

            {/* Pay Now button for clients */}
            {role === "client" && invoice.stripe_payment_url && invoice.status !== "paid" && (
              <Button asChild className="w-full sm:w-auto">
                <a href={invoice.stripe_payment_url} target="_blank" rel="noopener noreferrer">
                  Pay Now <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
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
            {/* min-w keeps columns readable on phones — the wrapper scrolls horizontally */}
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20 text-right">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit Price</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  {canEdit && <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>}
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
                      ) : fmt(Number(item.unit_price), invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(item.quantity * item.unit_price, invoice.currency)}</TableCell>
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
            {canEdit && <DiscountField value={discount} onChange={setDiscount} currency={invoice.currency} />}
            <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmt(subtotal, invoice.currency)}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>
                  {discountLabel(discount)}
                  {discount.reason && !canEdit && <span className="block text-xs text-muted-foreground">{discount.reason}</span>}
                </span>
                <span>−{fmt(discountAmount, invoice.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm"><span>Tax ({invoice.tax_rate ?? 0}%)</span><span>{fmt(taxAmount, invoice.currency)}</span></div>
            <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{fmt(total, invoice.currency)}</span></div>
            {invoice.currency && invoice.fx_rate && Number(invoice.fx_rate) !== 1 && (
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>Equivalent (rate {Number(invoice.fx_rate)})</span>
                <span>{fmt(total * Number(invoice.fx_rate))}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        {(canEdit || invoice.notes) && (
          <Card>
            <CardContent className="pt-6">
              <Label htmlFor="f-notes">Notes</Label>
              {canEdit ? (
                <Textarea id="f-notes"
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

        {(canEdit || canManage) && (
          <div className="space-y-2">
            {isDirty && !saving && (
              <p className="text-center text-sm text-warning">You have unsaved changes</p>
            )}
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        <InvoicePdfVersions
          invoice={invoice}
          clientName={clientName}
          items={items}
          workshop={workshop}
          currency={invoice.currency || "USD"}
          canGenerate={canManage}
        />
      </div>
    </DashboardLayout>
  );
}
