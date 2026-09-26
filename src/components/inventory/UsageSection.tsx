import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { ListControls } from "@/components/list/ListControls";
import { JobStatusPill } from "@/components/dashboard/StatusPill";
import ProjectName from "@/components/project/ProjectName";
import { projectPath } from "@/lib/projects";

type Movement = { job_id: string; type: string; quantity: number; inventory_items: { name: string; unit_cost: number } | null; jobs: { ref: string; title: string; status: string } | null };
type Row = { id: string; ref: string; title: string; status: string; lines: number; cost: number; items: string };

/**
 * Parts used by each project, at current unit cost: issued minus returned.
 * Reports use the same figures for material cost.
 */
export default function UsageSection() {
  const { format: fmt } = useCurrency();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void supabase
      .from("inventory_transactions")
      .select("job_id, type, quantity, inventory_items(name, unit_cost), jobs(ref, title, status)")
      .not("job_id", "is", null)
      .in("type", ["in", "out"])
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        setMovements((data ?? []) as unknown as Movement[]);
        setLoading(false);
      });
  }, []);

  const rows = useMemo(() => {
    const byJob = new Map<string, Row & { byItem: Map<string, number> }>();
    for (const m of movements) {
      if (!m.jobs) continue;
      const row = byJob.get(m.job_id) ?? { id: m.job_id, ref: m.jobs.ref, title: m.jobs.title, status: m.jobs.status, lines: 0, cost: 0, items: "", byItem: new Map() };
      const sign = m.type === "out" ? 1 : -1;
      const qty = sign * Number(m.quantity);
      row.cost += qty * Number(m.inventory_items?.unit_cost ?? 0);
      const name = m.inventory_items?.name ?? "Item";
      row.byItem.set(name, (row.byItem.get(name) ?? 0) + qty);
      byJob.set(m.job_id, row);
    }
    return [...byJob.values()]
      .map((r) => {
        const used = [...r.byItem.entries()].filter(([, q]) => q > 0);
        return { ...r, lines: used.length, items: used.map(([n, q]) => `${n} × ${q}`).join(", ") };
      })
      .filter((r) => r.lines > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [movements]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.ref.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
  const total = shown.reduce((s, r) => s + r.cost, 0);

  const columns: Column<Row>[] = [
    { key: "project", header: "Project", cell: (r) => <ProjectName refId={r.ref} title={r.title} /> },
    { key: "status", header: "Status", cell: (r) => <JobStatusPill status={r.status} />, hideBelow: "md" },
    { key: "items", header: "Parts used", cell: (r) => <span className="text-sm text-muted-foreground">{r.items}</span>, hideBelow: "lg" },
    { key: "cost", header: "Parts cost", cell: (r) => fmt(r.cost), align: "right" },
  ];

  return (
    <div className="space-y-4">
      <ListControls search={search} onSearchChange={setSearch} searchPlaceholder="Search by project ID or title" />
      {!loading && shown.length > 0 && <p className="text-sm text-muted-foreground">Parts cost across these projects: <span className="font-medium tabular-nums text-foreground">{fmt(total)}</span></p>}
      <DataList
        rows={shown}
        columns={columns}
        isLoading={loading}
        getRowKey={(r) => r.id}
        getRowHref={(r) => projectPath(r.id)}
        mobile={{ title: (r) => <ProjectName refId={r.ref} title={r.title} />, trailing: (r) => <span className="text-sm tabular-nums">{fmt(r.cost)}</span>, meta: (r) => r.items }}
        empty={<EmptyState title="No parts issued yet" description="Once stores issues parts to projects, their cost shows here." />}
      />
    </div>
  );
}
