import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileDown, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useIndustry } from "@/lib/industry";
import { MAX_IMPORT_ROWS, checkRows, mapHeaders, parseCsv, templateFor, toCsv, type ImportKind, type RowCheck, type Template } from "@/lib/csvImport";

const BATCH = 50;

function download(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** What's already in Shoplane, in the same columns as the template, so files round-trip. */
async function exportRows(kind: ImportKind, t: Template): Promise<(string | number | null)[][]> {
  const keys = t.columns.map((c) => c.key);
  const pick = (o: Record<string, unknown>) => keys.map((k) => (o[k] == null ? null : (o[k] as string | number)));
  if (kind === "clients") {
    const [{ data: list }, { data: profiles }] = await Promise.all([
      supabase.rpc("reception_clients"),
      supabase.from("profiles").select("id, contact_person, address"),
    ]);
    const extra = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (list ?? []).map((c) => pick({ ...c, contact_person: extra.get(c.id)?.contact_person, address: extra.get(c.id)?.address }));
  }
  if (kind === "stock") {
    const [{ data: items }, { data: suppliers }] = await Promise.all([
      supabase.from("inventory_items").select("name, sku, category, unit, quantity, unit_cost, min_stock, reorder_quantity, supplier_id, location").order("name"),
      supabase.from("suppliers").select("id, name"),
    ]);
    const sup = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
    return (items ?? []).map((i) => pick({ ...i, supplier: i.supplier_id ? sup.get(i.supplier_id) : null }));
  }
  const [{ data: assets }, { data: reminders }, { data: clients }] = await Promise.all([
    supabase.from("assets").select("id, client_id, owner_name, owner_phone, name, make_model, year_of_manufacture, colour, fuel_type, serial_number, registration, vin, fleet_number, meter_reading, notes").is("archived_at", null).order("name"),
    supabase.from("asset_reminders").select("asset_id, title, due_date, interval_months").eq("active", true).order("due_date"),
    supabase.rpc("reception_clients"),
  ]);
  const email = new Map((clients ?? []).map((c) => [c.id, c.email]));
  return (assets ?? []).map((a) => {
    const rs = (reminders ?? []).filter((r) => r.asset_id === a.id);
    const mot = rs.find((r) => r.title === "MOT");
    const other = rs.find((r) => r.title !== "MOT");
    return pick({
      ...a, year: a.year_of_manufacture, owner_email: a.client_id ? email.get(a.client_id) : null,
      service_title: other?.title, service_due: other?.due_date, service_every_months: other?.interval_months, mot_due: mot?.due_date,
    });
  });
}

/**
 * Import customers, stock and assets from CSV files, with sample files worded for this workshop's
 * industry, and export what's already here in the same columns.
 */
export default function ImportData() {
  const profile = useIndustry();
  const assetsOn = useFeature("assets");
  const inventoryOn = useFeature("inventory");
  const kinds: ImportKind[] = ["clients", ...(inventoryOn ? (["stock"] as const) : []), ...(assetsOn ? (["assets"] as const) : [])];

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Import and export"
          subtitle="Bring in your customers, stock and equipment from spreadsheets. Download a sample file, fill it in (or match your columns to it), and upload it."
        />
        <div className="space-y-4">
          {kinds.map((k) => <ImportCard key={k} template={templateFor(k, profile)} />)}
        </div>
        <p className="text-xs text-muted-foreground">
          Save spreadsheets as CSV (comma separated). Rows that already exist (same email, SKU or name, registration or serial) are skipped, never changed. Up to {MAX_IMPORT_ROWS.toLocaleString()} rows a file.
        </p>
      </div>
    </DashboardLayout>
  );
}

function ImportCard({ template: t }: { template: Template }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [checked, setChecked] = useState<RowCheck[] | null>(null);
  const [mapInfo, setMapInfo] = useState<{ missing: string[]; ignored: string[]; matched: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ line: number; status: string; message?: string }[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const slug = t.title.toLowerCase().replace(/[^a-z]+/g, "-");
  const ok = checked?.filter((r) => r.errors.length === 0) ?? [];
  const bad = checked?.filter((r) => r.errors.length > 0) ?? [];

  const pick = async (f: File | undefined) => {
    setResults(null);
    setChecked(null);
    setMapInfo(null);
    if (!f) return;
    setFile(f.name);
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return toast.error("That file has no rows under its header");
    if (rows.length - 1 > MAX_IMPORT_ROWS) return toast.error(`That's ${rows.length - 1} rows; split it into files of up to ${MAX_IMPORT_ROWS}.`);
    const { mapping, missingRequired, unknownHeaders } = mapHeaders(rows[0], t);
    setMapInfo({ missing: missingRequired.map((c) => c.header), ignored: unknownHeaders, matched: mapping.filter(Boolean).length });
    if (missingRequired.length === 0) setChecked(checkRows(rows.slice(1), mapping, t));
  };

  const run = async () => {
    if (!ok.length) return;
    setRunning(true);
    setProgress(0);
    const all: { line: number; status: string; message?: string }[] = bad.map((r) => ({ line: r.line, status: "not imported", message: r.errors.join("; ") }));
    for (let i = 0; i < ok.length; i += BATCH) {
      const batch = ok.slice(i, i + BATCH).map((r) => ({ line: r.line, values: r.values }));
      const { data, error } = await supabase.functions.invoke("import-data", { body: { kind: t.kind, rows: batch } });
      if (error || !data?.results) {
        let message = "The import stopped. Rows before this point were saved.";
        const ctx = (error as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.json === "function") message = (await ctx.json().catch(() => null))?.error ?? message;
        toast.error(message);
        batch.forEach((r) => all.push({ line: r.line, status: "failed", message }));
        break;
      }
      all.push(...data.results);
      setProgress(Math.round(((i + batch.length) / ok.length) * 100));
    }
    all.sort((a, b) => a.line - b.line);
    setResults(all);
    setRunning(false);
    const created = all.filter((r) => r.status === "created").length;
    toast.success(`${created} imported`);
  };

  const exportNow = async () => {
    setExporting(true);
    try {
      const rows = await exportRows(t.kind, t);
      download(`${slug}-export.csv`, toCsv(t.columns.map((c) => c.header), rows));
    } catch (e) {
      toast.error((e as Error).message);
    }
    setExporting(false);
  };

  const counts = results && {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "not imported").length,
  };

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t.title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => download(`${slug}-sample.csv`, toCsv(t.columns.map((c) => c.header), t.examples))}>
            <FileDown className="mr-1.5 h-4 w-4" />Sample file
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportNow()} disabled={exporting}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}Export
          </Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label={`Upload ${t.title} CSV`} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Button size="sm" onClick={() => input.current?.click()} disabled={running}>
            <Upload className="mr-1.5 h-4 w-4" />Upload CSV
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-4 py-3 text-sm">
        <details>
          <summary className="cursor-pointer text-muted-foreground">Columns</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {t.columns.map((c) => (
              <li key={c.key}>
                <span className="font-medium">{c.header}</span>
                {c.required ? <span className="text-destructive"> (required)</span> : null}
                {c.help ? <span className="text-muted-foreground"> · {c.help}</span> : null}
              </li>
            ))}
          </ul>
        </details>

        {mapInfo && (
          <div className="space-y-1">
            <p><span className="font-medium">{file}</span>: {mapInfo.matched} columns matched{mapInfo.ignored.length ? `; ignoring ${mapInfo.ignored.join(", ")}` : ""}.</p>
            {mapInfo.missing.length > 0 && (
              <p className="flex items-center gap-1.5 text-destructive"><AlertTriangle className="h-4 w-4" />Missing {mapInfo.missing.join(", ")}. Rename the column to match the sample file.</p>
            )}
          </div>
        )}

        {checked && !results && (
          <div className="space-y-3">
            <p>
              <span className="font-medium text-success">{ok.length} ready</span>
              {bad.length > 0 && <span className="text-warning"> · {bad.length} with problems (they'll be left out)</span>}
            </p>
            {bad.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-warning-soft/40 p-2 text-xs">
                {bad.slice(0, 50).map((r) => <li key={r.line}>Line {r.line}: {r.errors.join("; ")}</li>)}
              </ul>
            )}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="border-b bg-secondary/50 text-left">
                    <th className="px-2 py-1.5 font-medium">Line</th>
                    {t.columns.filter((c) => checked.some((r) => r.values[c.key])).slice(0, 6).map((c) => <th key={c.key} className="px-2 py-1.5 font-medium">{c.header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, 8).map((r) => (
                    <tr key={r.line} className={r.errors.length ? "bg-warning-soft/30" : ""}>
                      <td className="px-2 py-1.5 tabular-nums">{r.line}</td>
                      {t.columns.filter((c) => checked.some((x) => x.values[c.key])).slice(0, 6).map((c) => <td key={c.key} className="px-2 py-1.5">{r.values[c.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {running ? (
              <div className="space-y-1"><Progress value={progress} /><p className="text-xs text-muted-foreground">Importing… {progress}%</p></div>
            ) : (
              <Button onClick={() => void run()} disabled={!ok.length}>Import {ok.length} {ok.length === 1 ? "row" : "rows"}</Button>
            )}
          </div>
        )}

        {results && counts && (
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span><span className="font-medium">{counts.created}</span> imported</span>
              <span>{counts.skipped} skipped (already here)</span>
              {counts.failed > 0 && <span className="text-destructive">{counts.failed} not imported</span>}
            </p>
            <Button variant="outline" size="sm" onClick={() => download(`${slug}-import-results.csv`, toCsv(["Line", "Result", "Details"], results.map((r) => [r.line, r.status, r.message ?? ""])))}>
              <Download className="mr-1.5 h-4 w-4" />Download results
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
