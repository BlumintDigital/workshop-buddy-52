import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Columns3, Download, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/list/EmptyState";
import { TrendCharts } from "@/components/reports/TrendCharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { downloadCSV } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { projectPath, projectStatusLabel } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  ref: string | null;
  title: string;
  status: string;
  client_name: string | null;
  received_at: string | null;
  finished_at: string | null;
  charged: number;
  quoted_pending: number;
  invoiced: number;
  paid: number;
  materials_needed_value: number;
  materials_used_cost: number;
  labour_hours: number;
  estimated_hours: number;
  labour_cost: number;
  shipping_cost: number;
  overhead: number;
  total_cost: number;
  profit: number;
  margin_pct: number | null;
  forecast_profit: number;
  outcome: string;
  assignees: string[];
};

type Kind = "money" | "hours" | "text" | "date" | "pct";
const COLUMNS: { key: keyof Row; label: string; kind: Kind; hint?: string }[] = [
  { key: "client_name", label: "Client", kind: "text" },
  { key: "status", label: "Stage", kind: "text" },
  { key: "received_at", label: "Received", kind: "date" },
  { key: "finished_at", label: "Finished", kind: "date" },
  { key: "charged", label: "Charged", kind: "money", hint: "Accepted quotes, less discounts" },
  { key: "quoted_pending", label: "Quoted, not accepted", kind: "money" },
  { key: "invoiced", label: "Invoiced", kind: "money" },
  { key: "paid", label: "Paid", kind: "money" },
  { key: "materials_needed_value", label: "Parts still needed", kind: "money" },
  { key: "materials_used_cost", label: "Materials", kind: "money", hint: "Parts issued, less returns, at cost" },
  { key: "estimated_hours", label: "Estimated hours", kind: "hours" },
  { key: "labour_hours", label: "Hours", kind: "hours" },
  { key: "labour_cost", label: "Labour", kind: "money", hint: "Hours × each person's hourly cost" },
  { key: "shipping_cost", label: "Shipping", kind: "money" },
  { key: "overhead", label: "Overhead", kind: "money" },
  { key: "total_cost", label: "Total cost", kind: "money" },
  { key: "profit", label: "Profit", kind: "money" },
  { key: "margin_pct", label: "Margin", kind: "pct" },
  { key: "forecast_profit", label: "Forecast profit", kind: "money", hint: "Profit once the parts still needed are used" },
  { key: "assignees", label: "People", kind: "text" },
];
const DEFAULT_COLUMNS: (keyof Row)[] = ["client_name", "status", "charged", "materials_used_cost", "labour_cost", "shipping_cost", "overhead", "profit", "margin_pct"];

const OUTCOME: Record<string, { label: string; tone: StatusTone }> = {
  profit: { label: "Profit", tone: "success" },
  loss: { label: "Loss", tone: "danger" },
  on_track: { label: "On track", tone: "info" },
  at_risk: { label: "At risk", tone: "warning" },
  not_priced: { label: "Not priced", tone: "neutral" },
};

type Config = { from: string; to: string; outcome: string; stage: string; group: string; columns: (keyof Row)[] };
type Saved = { id: string; name: string; config: Config; created_by: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
function defaultConfig(): Config {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: iso(now), outcome: "all", stage: "all", group: "none", columns: DEFAULT_COLUMNS };
}

const FINISHED = ["completed", "shipped"];
const OPEN = ["received", "evaluation", "quote", "pending", "in_progress", "review"];

function groupKey(r: Row, group: string): string {
  if (group === "client") return r.client_name || "No client";
  if (group === "status") return projectStatusLabel(r.status);
  if (group === "outcome") return OUTCOME[r.outcome]?.label ?? r.outcome;
  if (group === "month") return r.received_at ? new Date(r.received_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "No date";
  return "";
}

function sum(rows: Row[]): Partial<Row> {
  const t: Partial<Record<keyof Row, number>> = {};
  for (const c of COLUMNS) if (c.kind === "money" || c.kind === "hours") t[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
  const charged = t.charged ?? 0;
  return { ...(t as Partial<Row>), margin_pct: charged > 0 ? Math.round(((t.profit ?? 0) / charged) * 1000) / 10 : null };
}

/**
 * Profit and loss for every project, built the way the reader wants it: pick
 * the dates, filter, group, choose columns and save the view for next time.
 * Costs are materials at cost, labour at each person's hourly cost, shipping and
 * the overhead % from Settings.
 */
function ProfitAndLoss() {
  const { user, role } = useAuth();
  const { format: fmt } = useCurrency();
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedId, setSavedId] = useState<string>(params.get("report") ?? "");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const loadSaved = useCallback(async () => {
    const { data } = await supabase.from("saved_reports").select("id, name, config, created_by").order("name");
    setSaved(((data ?? []) as unknown as Saved[]).map((s) => ({ ...s, config: { ...defaultConfig(), ...s.config } })));
  }, []);
  useEffect(() => void loadSaved(), [loadSaved]);

  // Opening a saved report (from the picker or a shared ?report= link) applies its settings.
  useEffect(() => {
    const s = saved.find((x) => x.id === savedId);
    if (s) setConfig(s.config);
  }, [savedId, saved]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    supabase.rpc("project_financials", { _from: config.from || undefined, _to: config.to || undefined }).then(({ data, error }) => {
      if (!live) return;
      if (error) toast.error(error.message);
      setRows(
        ((data ?? []) as unknown as Row[]).map((r) => {
          const n = { ...r } as Record<string, unknown>;
          for (const c of COLUMNS) if (c.kind === "money" || c.kind === "hours") n[c.key] = Number(r[c.key]) || 0;
          n.margin_pct = r.margin_pct == null ? null : Number(r.margin_pct);
          return n as unknown as Row;
        }),
      );
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [config.from, config.to]);

  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (config.outcome === "all" || r.outcome === config.outcome) &&
          (config.stage === "all" || (config.stage === "open" ? OPEN.includes(r.status) : config.stage === "finished" ? FINISHED.includes(r.status) : r.status === "cancelled")),
      ),
    [rows, config.outcome, config.stage],
  );
  const groups = useMemo(() => {
    if (config.group === "none") return null;
    const m = new Map<string, Row[]>();
    for (const r of shown) {
      const keys = config.group === "assignee" ? (r.assignees.length ? r.assignees : ["Nobody assigned"]) : [groupKey(r, config.group)];
      for (const k of keys) m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([name, list]) => ({ name, list, total: sum(list) })).sort((a, b) => (b.total.charged ?? 0) - (a.total.charged ?? 0));
  }, [shown, config.group]);
  const total = useMemo(() => sum(shown), [shown]);
  const losses = shown.filter((r) => r.outcome === "loss").length;
  const unpriced = shown.filter((r) => r.outcome === "not_priced").length;
  const cols = COLUMNS.filter((c) => config.columns.includes(c.key));

  const set = (patch: Partial<Config>) => setConfig((c) => ({ ...c, ...patch }));
  const cell = (c: (typeof COLUMNS)[number], v: unknown) => {
    if (v == null || v === "") return "—";
    if (c.kind === "money") return fmt(Number(v));
    if (c.kind === "hours") return `${Math.round(Number(v) * 10) / 10}`;
    if (c.kind === "pct") return `${v}%`;
    if (c.kind === "date") return formatDate(String(v));
    if (c.key === "status") return projectStatusLabel(String(v));
    if (Array.isArray(v)) return v.join(", ") || "—";
    return String(v);
  };
  const csvValue = (c: (typeof COLUMNS)[number], v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join("; ") : c.key === "status" ? projectStatusLabel(String(v)) : (v as string | number));

  const exportCsv = () => {
    const headers = ["Project", ...cols.map((c) => c.label), "Outcome"];
    const body = shown.map((r) => [r.ref ? `${r.ref} ${r.title}` : r.title, ...cols.map((c) => csvValue(c, r[c.key])), OUTCOME[r.outcome]?.label ?? r.outcome]);
    body.push(["Total", ...cols.map((c) => csvValue(c, c.kind === "money" || c.kind === "hours" || c.kind === "pct" ? total[c.key] : "")), ""]);
    downloadCSV(`profit-and-loss-${config.from}-to-${config.to}.csv`, headers, body);
  };

  const saveReport = async () => {
    const name = saveName.trim();
    if (!name || !user) return;
    const existing = saved.find((s) => s.name.toLowerCase() === name.toLowerCase() && s.created_by === user.id);
    const res = existing
      ? await supabase.from("saved_reports").update({ config: config as never }).eq("id", existing.id).select("id").single()
      : await supabase.from("saved_reports").insert({ name, config: config as never, created_by: user.id }).select("id").single();
    if (res.error) return toast.error(res.error.message);
    toast.success(existing ? `"${name}" updated` : `"${name}" saved`);
    setSaveOpen(false);
    await loadSaved();
    setSavedId(res.data.id);
    setParams((p) => { p.set("report", res.data.id); return p; }, { replace: true });
  };
  const current = saved.find((s) => s.id === savedId);
  const deleteReport = async () => {
    if (!current) return;
    const { error } = await supabase.from("saved_reports").delete().eq("id", current.id);
    if (error) return toast.error(error.message);
    toast.success(`"${current.name}" deleted`);
    setSavedId("");
    setParams((p) => { p.delete("report"); return p; }, { replace: true });
    void loadSaved();
  };

  const numeric = (c: (typeof COLUMNS)[number]) => c.kind === "money" || c.kind === "hours" || c.kind === "pct";
  const profitClass = (key: keyof Row, v: unknown) => ((key === "profit" || key === "forecast_profit" || key === "margin_pct") && Number(v) < 0 ? "font-medium text-destructive" : undefined);

  const renderRow = (r: Row) => (
    <tr key={r.id} className={cn("border-b last:border-0", r.outcome === "loss" && "bg-destructive-soft/40")}>
      <th scope="row" className="max-w-[16rem] px-4 py-2 text-left font-normal">
        <Link to={projectPath(r.id)} className="block truncate font-medium hover:underline">
          {r.ref && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{r.ref}</span>}
          {r.title}
        </Link>
      </th>
      {cols.map((c) => (
        <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", numeric(c) && "text-right tabular-nums", profitClass(c.key, r[c.key]))}>
          {cell(c, r[c.key])}
        </td>
      ))}
      <td className="px-4 py-2">
        <StatusPill tone={OUTCOME[r.outcome]?.tone ?? "neutral"}>{OUTCOME[r.outcome]?.label ?? r.outcome}</StatusPill>
      </td>
    </tr>
  );
  const renderTotal = (label: string, t: Partial<Row>, strong = false) => (
    <tr className={cn("border-b", strong ? "bg-muted font-semibold" : "bg-secondary/60 font-medium")}>
      <th scope="row" className="px-4 py-2 text-left">{label}</th>
      {cols.map((c) => (
        <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", numeric(c) && "text-right tabular-nums", profitClass(c.key, t[c.key]))}>
          {numeric(c) ? cell(c, t[c.key]) : ""}
        </td>
      ))}
      <td />
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div>
          <Label htmlFor="pl-saved" className="text-xs">Saved report</Label>
          <Select value={savedId || "none"} onValueChange={(v) => { setSavedId(v === "none" ? "" : v); if (v === "none") setConfig(defaultConfig()); setParams((p) => { if (v === "none") p.delete("report"); else p.set("report", v); return p; }, { replace: true }); }}>
            <SelectTrigger id="pl-saved" className="mt-1 h-10 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">New report</SelectItem>
              {saved.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-from" className="text-xs">Received from</Label>
          <Input id="pl-from" type="date" value={config.from} onChange={(e) => set({ from: e.target.value })} className="mt-1 h-10 w-40" />
        </div>
        <div>
          <Label htmlFor="pl-to" className="text-xs">to</Label>
          <Input id="pl-to" type="date" value={config.to} onChange={(e) => set({ to: e.target.value })} className="mt-1 h-10 w-40" />
        </div>
        <div>
          <Label htmlFor="pl-stage" className="text-xs">Projects</Label>
          <Select value={config.stage} onValueChange={(v) => set({ stage: v })}>
            <SelectTrigger id="pl-stage" className="mt-1 h-10 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Still open</SelectItem>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-outcome" className="text-xs">Outcome</Label>
          <Select value={config.outcome} onValueChange={(v) => set({ outcome: v })}>
            <SelectTrigger id="pl-outcome" className="mt-1 h-10 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              {Object.entries(OUTCOME).map(([k, o]) => <SelectItem key={k} value={k}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-group" className="text-xs">Group by</Label>
          <Select value={config.group} onValueChange={(v) => set({ group: v })}>
            <SelectTrigger id="pl-group" className="mt-1 h-10 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nothing</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="status">Stage</SelectItem>
              <SelectItem value="outcome">Outcome</SelectItem>
              <SelectItem value="month">Month received</SelectItem>
              <SelectItem value="assignee">Person</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10"><Columns3 className="mr-1.5 h-4 w-4" aria-hidden />Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={config.columns.includes(c.key)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => set({ columns: COLUMNS.map((x) => x.key).filter((k) => (k === c.key ? on : config.columns.includes(k))) })}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="h-10" onClick={() => { setSaveName(current?.name ?? ""); setSaveOpen(true); }}>
            <Save className="mr-1.5 h-4 w-4" aria-hidden />Save report
          </Button>
          {current && (current.created_by === user?.id || role === "admin") && (
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Delete saved report ${current.name}`} onClick={() => void deleteReport()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" className="h-10" onClick={exportCsv} disabled={!shown.length}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden />CSV
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Charged", fmt(total.charged ?? 0)],
          ["Total cost", fmt(total.total_cost ?? 0)],
          ["Profit", fmt(total.profit ?? 0)],
          ["Margin", total.margin_pct == null ? "—" : `${total.margin_pct}%`],
          ["Projects at a loss", `${losses} of ${shown.length}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className={cn("text-xl font-semibold tabular-nums", label === "Profit" && (total.profit ?? 0) < 0 && "text-destructive")}>{value}</dd>
            {label === "Projects at a loss" && unpriced > 0 && <dd className="text-xs text-muted-foreground">{unpriced} not priced yet</dd>}
          </div>
        ))}
      </dl>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-10"><EmptyState title="No projects match" description="Widen the dates or clear the filters." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Profit and loss by project">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-left font-medium">Project</th>
                  {cols.map((c) => (
                    <th key={c.key} scope="col" title={c.hint} className={cn("whitespace-nowrap px-3 py-2 font-medium", numeric(c) ? "text-right" : "text-left")}>{c.label}</th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-left font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {groups
                  ? groups.flatMap((g) => [renderTotal(`${g.name} (${g.list.length})`, g.total), ...g.list.map(renderRow)])
                  : shown.map(renderRow)}
              </tbody>
              <tfoot>{renderTotal(`Total (${shown.length})`, total, true)}</tfoot>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Charged is the accepted quote after discount. Costs are materials issued at cost, hours at each person's hourly cost, shipping and the overhead % set in Settings. At risk means the parts still needed would turn the project into a loss.
      </p>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save report</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pl-name">Name</Label>
            <Input id="pl-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Losses this quarter" maxLength={80} autoFocus />
            <p className="text-xs text-muted-foreground">Saves the dates, filters, grouping and columns. Everyone with Reports access can open it.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveReport()} disabled={!saveName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Person = { user_id: string; full_name: string; role: string; hours: number; handoffs: number; task_value: number; projects: number; labour_cost: number | null };

/** Who did what in the period: hours, tasks completed, handoffs and labour cost. */
function TeamReport() {
  const { format: fmt } = useCurrency();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(now));
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    setPeople(null);
    supabase.rpc("team_performance", { _from: `${from}T00:00:00`, _to: `${to}T23:59:59` }).then(({ data }) =>
      setPeople(
        ((data ?? []) as Person[])
          .map((p) => ({ ...p, hours: Number(p.hours), handoffs: Number(p.handoffs), task_value: Number(p.task_value), projects: Number(p.projects), labour_cost: p.labour_cost == null ? null : Number(p.labour_cost) }))
          .sort((a, b) => b.hours - a.hours),
      ),
    );
  }, [from, to]);

  const exportCsv = () =>
    downloadCSV(`team-${from}-to-${to}.csv`, ["Person", "Role", "Projects", "Hours", "Tasks completed value", "Handoffs", "Labour cost"], (people ?? []).map((p) => [p.full_name, p.role, p.projects, p.hours, p.task_value, p.handoffs, p.labour_cost ?? ""]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div>
          <Label htmlFor="tm-from" className="text-xs">From</Label>
          <Input id="tm-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-40" />
        </div>
        <div>
          <Label htmlFor="tm-to" className="text-xs">to</Label>
          <Input id="tm-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-40" />
        </div>
        <Button variant="outline" className="ml-auto h-10" onClick={exportCsv} disabled={!people?.length}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden />CSV
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        {!people ? (
          <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Team performance">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Person</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Projects</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Hours</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Tasks completed</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Handoffs</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Labour cost</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.user_id} className="border-b last:border-0">
                    <th scope="row" className="px-4 py-2 text-left font-medium">
                      {p.full_name}
                      <span className="ml-1.5 text-xs font-normal capitalize text-muted-foreground">{p.role}</span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{p.projects}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(p.hours * 10) / 10}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.task_value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.handoffs}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{p.labour_cost == null ? "—" : fmt(p.labour_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Labour cost uses each person's hourly cost from Teams and access. People without a rate show no cost.</p>
    </div>
  );
}

export default function ReportsPage() {
  const { has, loading } = usePermissions();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "pl";

  if (!loading && !has("reports")) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl space-y-4">
          <PageBar title="Reports" />
          <div className="rounded-lg border bg-card px-4 py-10 text-center">
            <EmptyState title="You don't have reports access" description="Ask an admin to give you Reports and costs in Teams and access." />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-4">
        <PageBar title="Reports" subtitle="Profit and loss by project, team performance and trends" />
        <Tabs value={tab} onValueChange={(v) => setParams((p) => { p.set("tab", v); return p; }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="pl">Profit and loss</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>
          <TabsContent value="pl" className="mt-4"><ProfitAndLoss /></TabsContent>
          <TabsContent value="team" className="mt-4"><TeamReport /></TabsContent>
          <TabsContent value="trends" className="mt-4"><TrendCharts /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
