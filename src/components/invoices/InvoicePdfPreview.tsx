import { useEffect, useMemo, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";
import { InvoiceDocument, type WorkshopDetails } from "@/lib/invoicePdf";

interface Props {
  invoice: any;
  clientName: string;
  items: { description: string; quantity: number; unit_price: number }[];
  workshop?: WorkshopDetails;
  currency: string;
  height?: number;
}

/**
 * Live in-browser PDF preview. Debounces re-renders so each keystroke
 * doesn't thrash the PDF engine.
 */
export default function InvoicePdfPreview({ invoice, clientName, items, workshop, currency, height = 820 }: Props) {
  const [debounced, setDebounced] = useState({ invoice, clientName, items, workshop, currency });

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced({ invoice, clientName, items, workshop, currency });
    }, 350);
    return () => clearTimeout(t);
  }, [invoice, clientName, items, workshop, currency]);

  const doc = useMemo(
    () => (
      <InvoiceDocument
        invoice={debounced.invoice}
        clientName={debounced.clientName}
        items={debounced.items}
        workshop={debounced.workshop}
        currency={debounced.currency}
      />
    ),
    [debounced]
  );

  return (
    <div className="w-full overflow-hidden rounded-md border bg-muted/30">
      <PDFViewer
        showToolbar={false}
        style={{ width: "100%", height, border: "none" }}
      >
        {doc}
      </PDFViewer>
    </div>
  );
}
