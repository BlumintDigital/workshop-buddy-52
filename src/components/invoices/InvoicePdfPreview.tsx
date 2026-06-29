import { useEffect, useMemo, useState } from "react";
import { PDFViewer, pdf } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { InvoiceDocument, type WorkshopDetails } from "@/lib/invoicePdf";

interface Props {
  invoice: any;
  clientName: string;
  items: { description: string; quantity: number; unit_price: number }[];
  workshop?: WorkshopDetails;
  currency: string;
  height?: number;
  downloadFileName?: string;
  showDownload?: boolean;
}

/**
 * Live in-browser PDF preview. Debounces re-renders so each keystroke
 * doesn't thrash the PDF engine.
 */
export default function InvoicePdfPreview({
  invoice,
  clientName,
  items,
  workshop,
  currency,
  height = 820,
  downloadFileName,
  showDownload = true,
}: Props) {
  const [debounced, setDebounced] = useState({ invoice, clientName, items, workshop, currency });
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (downloadFileName || debounced.invoice?.invoice_number || "invoice") + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-2">
      {showDownload && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading}>
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      )}
      <div className="w-full overflow-hidden rounded-md border bg-muted/30">
        <PDFViewer
          showToolbar={false}
          style={{ width: "100%", height, border: "none" }}
        >
          {doc}
        </PDFViewer>
      </div>
    </div>
  );
}
