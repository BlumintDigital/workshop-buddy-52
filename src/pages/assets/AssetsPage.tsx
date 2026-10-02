import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { AssetFormDialog } from "@/components/assets/AssetDialogs";
import { useAssetList, useReceptionClients, type AssetRow } from "@/hooks/useAssets";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { assetSummary, useIndustry } from "@/lib/industry";
import { REMINDER_STATE_LABEL, REMINDER_STATE_TONE, describeDue, formatMeter, reminderState } from "@/lib/assets";

/**
 * The workshop's register of its customers' machines, vehicles or equipment (named for the
 * workshop's industry), with what's due for service.
 */
export default function AssetsPage() {
  const profile = useIndustry();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { has } = usePermissions();
  const canManage = role === "admin" || role === "manager" || has("reception") || has("planning");
  const { data: rows = [], isLoading } = useAssetList();
  const { data: clients = [] } = useReceptionClients(canManage);
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => ({
    due: rows.filter((r) => r.state === "due_soon" || r.state === "overdue").length,
    overdue: rows.filter((r) => r.state === "overdue").length,
  }), [rows]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase().replace(/\s+/g, "");
    return rows.filter((r) => {
      if (filter === "due" && r.state !== "due_soon" && r.state !== "overdue") return false;
      if (filter === "overdue" && r.state !== "overdue") return false;
      if (!s) return true;
      return [r.name, r.make_model, r.serial_number, r.registration, r.fleet_number, r.vin, r.owner]
        .some((v) => (v ?? "").toLowerCase().replace(/\s+/g, "").includes(s));
    });
  }, [rows, filter, search]);

  const filters: FilterOption[] = [
    { value: "all", label: "All", count: rows.length },
    { value: "due", label: "Due soon", count: counts.due },
    { value: "overdue", label: "Overdue", count: counts.overdue },
  ];

  const nextDue = (r: AssetRow) => {
    const pending = r.reminders
      .map((m) => ({ m, s: reminderState(m, r.meter_reading) }))
      .sort((a, b) => (a.m.due_date ?? "9999").localeCompare(b.m.due_date ?? "9999"));
    const first = pending.find((p) => p.s === "overdue") ?? pending.find((p) => p.s === "due_soon") ?? pending[0];
    return first ? `${first.m.title}: ${describeDue(first.m, r.meter_unit).replace(/^Due /, "")}` : "No reminders";
  };

  const statePill = (r: AssetRow) =>
    r.state && r.state !== "ok" ? <StatusPill tone={REMINDER_STATE_TONE[r.state]}>{REMINDER_STATE_LABEL[r.state]}</StatusPill> : null;

  const columns: Column<AssetRow>[] = [
    { key: "name", header: profile.asset.navLabel.replace(/s$/, ""), cell: (r) => <span className="font-medium">{assetSummary(r)}</span> },
    { key: "owner", header: "Owner", cell: (r) => r.owner, hideBelow: "md" },
    { key: "meter", header: "Reading", cell: (r) => formatMeter(r.meter_reading, r.meter_unit) ?? "—", hideBelow: "lg" },
    { key: "next", header: "Next service", cell: (r) => <span className="text-sm text-muted-foreground">{nextDue(r)}</span>, hideBelow: "lg" },
    { key: "state", header: "Status", cell: statePill },
  ];

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title={profile.asset.navLabel}
          subtitle={isLoading ? "Loading…" : `${rows.length} ${rows.length === 1 ? profile.asset.singular : profile.asset.plural}${counts.due ? ` · ${counts.due} due for service` : ""}`}
          actions={canManage ? (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add {profile.asset.singular}
            </Button>
          ) : undefined}
        />
        <ListControls filters={filters} filter={filter} onFilterChange={setFilter} search={search} onSearchChange={setSearch} searchPlaceholder={profile.intake.findPlaceholder.replace(/^Find /, "Search ")} />
        <DataList
          rows={visible}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(r) => r.id}
          getRowHref={(r) => `/assets/${r.id}`}
          mobile={{ title: (r) => assetSummary(r), trailing: statePill, meta: (r) => `${r.owner} · ${nextDue(r)}` }}
          empty={
            rows.length ? (
              <EmptyState title="Nothing matches" description="Try another filter or search." />
            ) : (
              <EmptyState
                title={`No ${profile.asset.plural} yet`}
                description={`They're added when reception logs a project, or add one here. Each keeps its service history and reminders.`}
                action={canManage ? <Button onClick={() => setAdding(true)}><Plus />Add {profile.asset.singular}</Button> : undefined}
              />
            )
          }
        />
      </div>
      <AssetFormDialog open={adding} onOpenChange={setAdding} clients={clients} onSaved={(id) => navigate(`/assets/${id}`)} />
    </DashboardLayout>
  );
}
