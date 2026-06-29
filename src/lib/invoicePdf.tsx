import { pdf, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111", position: "relative" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  brandBlock: { flexDirection: "column", maxWidth: 260 },
  logo: { width: 80, height: 80, objectFit: "contain", marginBottom: 6 },
  workshopName: { fontSize: 18, fontWeight: "bold", marginBottom: 2 },
  companyLine: { fontSize: 9, color: "#555", lineHeight: 1.4 },
  invoiceTitleBlock: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 26, fontWeight: "bold", letterSpacing: 2, color: "#7d9b76" },
  invoiceNumber: { fontSize: 10, color: "#555", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, marginTop: 8 },
  metaBlock: { flexDirection: "column", gap: 2, minWidth: 110 },
  metaLabel: { color: "#666", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontWeight: "bold", fontSize: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 12 },
  table: { marginTop: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: "6 8", borderRadius: 2 },
  tableRow: { flexDirection: "row", padding: "5 8", borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  colDesc: { flex: 1 },
  colQty: { width: 40, textAlign: "right" },
  colPrice: { width: 70, textAlign: "right" },
  colTotal: { width: 70, textAlign: "right" },
  headerText: { fontSize: 9, color: "#666", fontWeight: "bold" },
  totalSection: { marginTop: 16, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", gap: 40, marginBottom: 4 },
  totalLabel: { color: "#666", width: 80, textAlign: "right" },
  totalValue: { width: 80, textAlign: "right" },
  grandTotalRow: { flexDirection: "row", gap: 40, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  grandTotalLabel: { fontWeight: "bold", fontSize: 12, width: 80, textAlign: "right" },
  grandTotalValue: { fontWeight: "bold", fontSize: 12, width: 80, textAlign: "right" },
  notes: { marginTop: 16 },
  notesLabel: { color: "#666", marginBottom: 4 },
  statusBadge: { fontSize: 9, color: "#666", textTransform: "uppercase" },
  draftMark: {
    position: "absolute",
    top: 320,
    left: 90,
    fontSize: 110,
    color: "#7d9b76",
    opacity: 0.08,
    transform: "rotate(-25deg)",
    fontWeight: "bold",
    letterSpacing: 8,
  },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, textAlign: "center", color: "#888", fontSize: 8 },
});

export interface WorkshopDetails {
  workshop_name?: string | null;
  address?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  logo_url?: string | null;
}

interface InvoicePDFProps {
  invoice: any;
  clientName: string;
  items: { description: string; quantity: number; unit_price: number }[];
  workshop?: WorkshopDetails;
  currency?: string;
}

export function InvoiceDocument({ invoice, clientName, items, workshop, currency = "USD" }: InvoicePDFProps) {
  const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  const taxRate = Number(invoice?.tax_rate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  };

  const isDraft = (invoice?.status || "").toLowerCase() === "draft";
  const workshopName = workshop?.workshop_name || "Workshop";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isDraft && <Text style={styles.draftMark}>DRAFT</Text>}

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            {workshop?.logo_url ? <Image src={workshop.logo_url} style={styles.logo} /> : null}
            <Text style={styles.workshopName}>{workshopName}</Text>
            {workshop?.address ? <Text style={styles.companyLine}>{workshop.address}</Text> : null}
            {workshop?.phone ? <Text style={styles.companyLine}>{workshop.phone}</Text> : null}
            {workshop?.contact_email ? <Text style={styles.companyLine}>{workshop.contact_email}</Text> : null}
          </View>
          <View style={styles.invoiceTitleBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{invoice?.invoice_number || "—"}</Text>
            <Text style={[styles.statusBadge, { marginTop: 4 }]}>{(invoice?.status || "draft").toUpperCase()}</Text>
          </View>
        </View>

        {/* Bill To + dates */}
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Bill To</Text>
            <Text style={styles.metaValue}>{clientName || "—"}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Issue Date</Text>
            <Text style={styles.metaValue}>{(invoice?.created_at || new Date().toISOString()).slice(0, 10)}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Due Date</Text>
            <Text style={styles.metaValue}>{invoice?.due_date || "—"}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Currency</Text>
            <Text style={styles.metaValue}>{currency}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colDesc]}>DESCRIPTION</Text>
            <Text style={[styles.headerText, styles.colQty]}>QTY</Text>
            <Text style={[styles.headerText, styles.colPrice]}>UNIT PRICE</Text>
            <Text style={[styles.headerText, styles.colTotal]}>TOTAL</Text>
          </View>
          {items.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.colDesc, { color: "#999" }]}>No items yet</Text>
              <Text style={styles.colQty}>—</Text>
              <Text style={styles.colPrice}>—</Text>
              <Text style={styles.colTotal}>—</Text>
            </View>
          ) : (
            items.map((item, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.colDesc}>{item.description || "—"}</Text>
                <Text style={styles.colQty}>{item.quantity}</Text>
                <Text style={styles.colPrice}>{fmt(Number(item.unit_price))}</Text>
                <Text style={styles.colTotal}>{fmt((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}</Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{fmt(subtotal)}</Text>
          </View>
          {taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
              <Text style={styles.totalValue}>{fmt(taxAmount)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{fmt(total)}</Text>
          </View>
        </View>

        {/* Notes */}
        {invoice?.notes ? (
          <View style={styles.notes}>
            <View style={styles.divider} />
            <Text style={styles.notesLabel}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {workshopName} · Thank you for your business
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Fetch workshop details from Supabase, then generate and download a PDF.
 */
export async function generateInvoicePDF(props: Omit<InvoicePDFProps, "workshop">): Promise<void> {
  const { data: settings } = await supabase
    .from("workshop_settings")
    .select("workshop_name, address, phone, contact_email, logo_url, currency")
    .eq("id", 1)
    .maybeSingle();

  const workshop: WorkshopDetails = {
    workshop_name: settings?.workshop_name || "Workshop",
    address: (settings as any)?.address,
    phone: (settings as any)?.phone,
    contact_email: (settings as any)?.contact_email,
    logo_url: (settings as any)?.logo_url,
  };
  const currency = props.invoice?.currency || (settings as any)?.currency || "USD";

  const blob = await pdf(
    <InvoiceDocument {...props} workshop={workshop} currency={currency} />
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.invoice.invoice_number}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
