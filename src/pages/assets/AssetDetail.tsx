import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, Check, Gauge, MoreHorizontal, Pencil, Plus, Printer, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/dashboard/Panel";
import { JobStatusPill, StatusPill } from "@/components/dashboard/StatusPill";
import { EmptyState } from "@/components/list/EmptyState";
import { AssetFormDialog, CompleteReminderDialog, ReminderDialog } from "@/components/assets/AssetDialogs";
import NewRequestDialog from "@/components/client/NewRequestDialog";
import { useAsset, useAssetActions, useReceptionClients, type AssetReminder } from "@/hooks/useAssets";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { ASSET_KIND_LABEL, useIndustry } from "@/lib/industry";
import { REMINDER_STATE_LABEL, REMINDER_STATE_TONE, describeDue, describeInterval, formatMeter, reminderState } from "@/lib/assets";
import { projectPath } from "@/lib/projects";

const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/** One machine, vehicle or piece of equipment: details, service reminders and every project it came in for. */
export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profile = useIndustry();
  const { role } = useAuth();
  const { has } = usePermissions();
  const isClient = role === "client";
  const canManage = role === "admin" || role === "manager" || has("reception") || has("planning");
  const { data, isLoading } = useAsset(id);
  const { data: clients = [] } = useReceptionClients(canManage);
  const actions = useAssetActions();
  const [editing, setEditing] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [editReminder, setEditReminder] = useState<AssetReminder | null>(null);
  const [completing, setCompleting] = useState<AssetReminder | null>(null);
  const [meterOpen, setMeterOpen] = useState(false);
  const [meter, setMeter] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const back = isClient ? "/client/assets" : "/assets";

  if (isLoading) {
    return <DashboardLayout><div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>;
  }
  if (!data) {
    return (
      <DashboardLayout>
        <EmptyState title={`This ${profile.asset.singular} isn't available`} description="It may have been archived, or you don't have access to it." action={<Button asChild variant="outline"><Link to={back}>Back</Link></Button>} />
      </DashboardLayout>
    );
  }

  const { asset, owner, reminders, jobs } = data;
  const unit = asset.meter_unit ?? profile.asset.meterUnit;
  const ids = [
    asset.registration && ["Registration", asset.registration],
    asset.fleet_number && ["Fleet number", asset.fleet_number],
    asset.vin && ["VIN", asset.vin],
    asset.serial_number && [profile.intake.serialLabel, asset.serial_number],
  ].filter(Boolean) as [string, string][];
  const nextService = reminders.filter((r) => r.active).map((r) => r.title)[0];

  const saveMeter = async () => {
    const v = Number(meter);
    if (meter.trim() === "" || Number.isNaN(v) || v < 0) return toast.error("Enter the reading as a number");
    try {
      await actions.updateMeter(asset.id, v);
      toast.success("Reading updated");
      setMeterOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeReminder = async (r: AssetReminder) => {
    try {
      await actions.deleteReminder(asset.id, r.id);
      toast.success(`${r.title} removed`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const archive = async () => {
    try {
      await actions.archiveAsset(asset.id);
      toast.success(`${asset.name} archived`);
      navigate("/assets");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <Link to={back} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {isClient ? `Your ${profile.asset.plural}` : profile.asset.navLabel}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{ASSET_KIND_LABEL[asset.kind]}{!isClient ? ` · ${owner}` : ""}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{asset.name}</h1>
            {ids.length > 0 && <p className="mt-1 font-mono text-sm text-muted-foreground">{ids.map(([, v]) => v).join(" · ")}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isClient ? (
              <Button onClick={() => setRequestOpen(true)}><Wrench className="mr-1.5 h-4 w-4" aria-hidden />Request a service</Button>
            ) : (
              <>
                {has("reception") && (
                  <Button onClick={() => navigate(`/reception?asset=${asset.id}`)}><Plus className="mr-1.5 h-4 w-4" aria-hidden />New project</Button>
                )}
                <Button variant="outline" asChild>
                  <a href={`/print/asset-label/${asset.id}`} target="_blank" rel="noopener"><Printer className="mr-1.5 h-4 w-4" aria-hidden />Print label</a>
                </Button>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="More actions"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem className="min-h-[40px]" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit details</DropdownMenuItem>
                      <DropdownMenuItem className="min-h-[40px]" onClick={() => { setMeter(asset.meter_reading != null ? String(Math.round(asset.meter_reading)) : ""); setMeterOpen(true); }}>
                        <Gauge className="mr-2 h-4 w-4" />Update reading
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-[40px] text-destructive focus:text-destructive" onClick={() => void archive()}>
                        <Trash2 className="mr-2 h-4 w-4" />Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Details" className="lg:col-span-1">
            <dl className="divide-y text-sm">
              {asset.make_model && <Row label="Make and model" value={asset.make_model} />}
              {asset.year_of_manufacture != null && <Row label="Year" value={String(asset.year_of_manufacture)} />}
              {asset.colour && <Row label="Colour" value={asset.colour} />}
              {asset.fuel_type && <Row label="Fuel" value={asset.fuel_type} />}
              {ids.map(([k, v]) => <Row key={k} label={k} value={<span className="font-mono">{v}</span>} />)}
              <Row label="Reading" value={formatMeter(asset.meter_reading, unit) ? `${formatMeter(asset.meter_reading, unit)}${asset.meter_read_at ? ` (${fmtDate(asset.meter_read_at)})` : ""}` : "Not recorded"} />
              {!isClient && <Row label="Owner" value={owner} />}
              {!isClient && !asset.client_id && (asset.owner_phone || asset.owner_email) && (
                <Row label="Contact" value={[asset.owner_phone, asset.owner_email].filter(Boolean).join(" · ")} />
              )}
              {asset.notes && <Row label="Notes" value={<span className="whitespace-pre-wrap">{asset.notes}</span>} />}
            </dl>
          </Panel>

          <Panel
            title={<><CalendarClock className="h-4 w-4" aria-hidden />Service reminders</>}
            className="lg:col-span-2"
            actions={canManage ? <Button size="sm" variant="outline" onClick={() => { setEditReminder(null); setReminderOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add reminder</Button> : undefined}
          >
            {reminders.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {canManage ? `No reminders yet. Add the services or inspections this ${profile.asset.singular} needs, and the owner is told when each comes due.` : "No services scheduled."}
              </p>
            ) : (
              <ul className="divide-y">
                {reminders.map((r) => {
                  const state = reminderState(r, asset.meter_reading);
                  const interval = describeInterval(r.interval_months, r.interval_meter, unit);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{r.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {r.active ? describeDue(r, unit) : `Done ${fmtDate(r.last_done_on)}`}
                          {interval ? ` · ${interval}` : ""}
                          {r.active && r.last_done_on ? ` · last done ${fmtDate(r.last_done_on)}` : ""}
                        </p>
                      </div>
                      <StatusPill tone={REMINDER_STATE_TONE[state]}>{REMINDER_STATE_LABEL[state]}</StatusPill>
                      {canManage && r.active && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setCompleting(r)}><Check className="mr-1 h-4 w-4" />Mark done</Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More for ${r.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditReminder(r); setReminderOpen(true); }}>Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void removeReminder(r)}>Remove</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title={`Service history · ${jobs.length} ${jobs.length === 1 ? "project" : "projects"}`}>
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nothing yet. Projects logged for this {profile.asset.singular} at reception appear here.</p>
          ) : (
            <ul className="divide-y">
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link to={projectPath(j.id)} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/60">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{j.ref ? `${j.ref} · ` : ""}{j.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        Received {fmtDate(j.received_at ?? j.created_at)}{formatMeter(j.meter_reading, unit) ? ` · ${formatMeter(j.meter_reading, unit)}` : ""}
                      </span>
                    </span>
                    <JobStatusPill status={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {canManage && (
        <>
          <AssetFormDialog open={editing} onOpenChange={setEditing} asset={asset} clients={clients} />
          <ReminderDialog open={reminderOpen} onOpenChange={setReminderOpen} asset={asset} reminder={editReminder} />
          <CompleteReminderDialog open={!!completing} onOpenChange={(v) => !v && setCompleting(null)} asset={asset} reminder={completing} jobs={jobs.slice(0, 10)} />
          <Dialog open={meterOpen} onOpenChange={setMeterOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Update reading</DialogTitle>
                <DialogDescription>The current {unit} on {asset.name}. Reminders by {unit} use it.</DialogDescription>
              </DialogHeader>
              <Input inputMode="decimal" aria-label={`Reading in ${unit}`} value={meter} onChange={(e) => setMeter(e.target.value)} autoFocus />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMeterOpen(false)}>Cancel</Button>
                <Button onClick={saveMeter}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {isClient && (
        <NewRequestDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          onCreated={() => undefined}
          asset={{ id: asset.id, name: asset.name }}
          initialTitle={`${nextService ?? "Service"}: ${asset.name}`}
        />
      )}
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
    </div>
  );
}
