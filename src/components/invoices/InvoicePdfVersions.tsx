import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pdf } from "@react-pdf/renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, FilePlus2, History } from "lucide-react";
import { toast } from "sonner";
import { InvoiceDocument, type WorkshopDetails } from "@/lib/invoicePdf";

interface InvoicePdfVersion {
  id: string;
  invoice_id: string;
  version: number;
  status_at_generation: string | null;
  file_path: string;
  file_size: number | null;
  generated_at: string;
  generated_by: string | null;
}

interface Props {
  invoice: any;
  clientName: string;
  items: { description: string; quantity: number; unit_price: number }[];
  workshop?: WorkshopDetails;
  currency: string;
  canGenerate: boolean;
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  paid: "default",
  overdue: "destructive",
  cancelled: "destructive",
};

function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function InvoicePdfVersions({
  invoice,
  clientName,
  items,
  workshop,
  currency,
  canGenerate,
}: Props) {
  const [versions, setVersions] = useState<InvoicePdfVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!invoice?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoice_pdf_versions")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("version", { ascending: false });
    if (error) toast.error(error.message);
    setVersions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  const handleGenerate = async () => {
    if (!invoice?.id) return;
    setBusy(true);
    try {
      const blob = await pdf(
        <InvoiceDocument
          invoice={invoice}
          clientName={clientName}
          items={items}
          workshop={workshop}
          currency={currency}
        />
      ).toBlob();

      const nextVersion = (versions[0]?.version ?? 0) + 1;
      const filePath = `${invoice.id}/v${nextVersion}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("invoice-pdfs")
        .upload(filePath, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;

      const { data: auth } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("invoice_pdf_versions").insert({
        invoice_id: invoice.id,
        version: nextVersion,
        status_at_generation: invoice.status || "draft",
        file_path: filePath,
        file_size: blob.size,
        generated_by: auth.user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast.success(`Saved version v${nextVersion}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save PDF version");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (v: InvoicePdfVersion) => {
    const { data, error } = await supabase.storage
      .from("invoice-pdfs")
      .createSignedUrl(v.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || "Could not get download link");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = `${invoice.invoice_number}-v${v.version}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> PDF Versions
        </CardTitle>
        {canGenerate && (
          <Button size="sm" variant="outline" onClick={handleGenerate} disabled={busy}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            {busy ? "Saving…" : "Save PDF version"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved PDFs yet. {canGenerate ? "Save a version to keep a downloadable snapshot." : ""}
          </p>
        ) : (
          <ul className="divide-y">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>v{v.version}</span>
                    {v.status_at_generation && (
                      <Badge variant={statusVariant[v.status_at_generation] ?? "outline"}>
                        {v.status_at_generation}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.generated_at).toLocaleString()} · {formatBytes(v.file_size)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleDownload(v)}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
