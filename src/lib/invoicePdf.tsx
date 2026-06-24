import { pdf, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 11, color: "#666" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  metaBlock: { flexDirection: "column", gap: 2 },
  metaLabel: { color: "#666", fontSize: 9 },
  metaValue: { fontWeight: "bold" },
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
});

interface InvoicePDFProps {
  invoice: any;
  clientName: string;
  items: { description: string; quantity: number; unit_price: number }[];
  workshopName?: string;
}

function InvoiceDocument({ invoice, clientName, items, workshopName = "Workshop", currency = "USD" }: InvoicePDFProps & { currency?: string }) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const taxRate = invoice.tax_rate ?? 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{workshopName}</Text>
        </View>

        {/* Invoice meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>INVOICE #</Text>
            <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>CLIENT</Text>
            <Text style={styles.metaValue}>{clientName}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>DUE DATE</Text>
            <Text style={styles.metaValue}>{invoice.due_date || "—"}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>STATUS</Text>
            <Text style={[styles.metaValue, styles.statusBadge]}>{invoice.status?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Line items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.colDesc]}>DESCRIPTION</Text>
            <Text style={[styles.headerText, styles.colQty]}>QTY</Text>
            <Text style={[styles.headerText, styles.colPrice]}>UNIT PRICE</Text>
            <Text style={[styles.headerText, styles.colTotal]}>TOTAL</Text>
          </View>
          {items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>${Number(item.unit_price).toFixed(2)}</Text>
              <Text style={styles.colTotal}>${(item.quantity * item.unit_price).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>${subtotal.toFixed(2)}</Text>
          </View>
          {taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({taxRate}%)</Text>
              <Text style={styles.totalValue}>${taxAmount.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <View style={styles.divider} />
            <Text style={styles.notesLabel}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

/**
 * Fetch workshop name from Supabase, then generate and download a PDF.
 */
export async function generateInvoicePDF(props: Omit<InvoicePDFProps, "workshopName">): Promise<void> {
  const { data: settings } = await supabase
    .from("workshop_settings")
    .select("workshop_name")
    .eq("id", 1)
    .maybeSingle();

  const workshopName = settings?.workshop_name || "Workshop";

  const blob = await pdf(<InvoiceDocument {...props} workshopName={workshopName} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.invoice.invoice_number}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
