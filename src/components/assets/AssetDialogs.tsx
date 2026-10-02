import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { clientLabel, type ReceptionClient } from "@/components/project/IntakeForm";
import { ensureMotReminder, useAssetActions, type Asset, type AssetInput, type AssetReminder } from "@/hooks/useAssets";
import { VehicleLookupButton, VinDecodeButton } from "@/components/lookup/VehicleLookupButton";
import { describeMotHistory, describeVehicle, vehicleMakeModel, type VehicleLookup, type VinLookup } from "@/lib/lookup";
import { ASSET_KIND_LABEL, METER_LABEL, normaliseRegistration, useIndustry, type AssetKind, type MeterUnit } from "@/lib/industry";
import { firstDueDate } from "@/lib/assets";

const NO_OWNER = "__none__";
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const today = () => new Date().toISOString().slice(0, 10);

/** Add or edit an asset: owner, what it is, how to identify it, and its meter. */
export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
  clients,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset?: Asset | null;
  clients: ReceptionClient[];
  defaultClientId?: string | null;
  onSaved?: (id: string) => void;
}) {
  const profile = useIndustry();
  const actions = useAssetActions();
  const blank = () => ({
    client: asset?.client_id ?? defaultClientId ?? NO_OWNER,
    owner_name: asset?.owner_name ?? "",
    owner_phone: asset?.owner_phone ?? "",
    owner_email: asset?.owner_email ?? "",
    kind: (asset?.kind ?? profile.asset.kind) as AssetKind,
    name: asset?.name ?? "",
    make_model: asset?.make_model ?? "",
    year: asset?.year_of_manufacture != null ? String(asset.year_of_manufacture) : "",
    colour: asset?.colour ?? "",
    fuel_type: asset?.fuel_type ?? "",
    serial_number: asset?.serial_number ?? "",
    registration: asset?.registration ?? "",
    vin: asset?.vin ?? "",
    fleet_number: asset?.fleet_number ?? "",
    meter_unit: (asset?.meter_unit ?? profile.asset.meterUnit) as MeterUnit,
    meter_reading: asset?.meter_reading != null ? String(asset.meter_reading) : "",
    notes: asset?.notes ?? "",
  });
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset?.id]);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((x) => ({ ...x, [k]: v }));
  const vehicle = f.kind === "vehicle";
  const noClient = f.client === NO_OWNER;

  // Registration lookup (UK) or VIN decode fills in what it knows; the MOT date becomes a reminder on save.
  const [found, setFound] = useState<VehicleLookup | null>(null);
  useEffect(() => setFound(null), [open]);
  const applyVehicle = (v: VehicleLookup) => {
    setFound(v);
    const makeModel = vehicleMakeModel(v);
    setF((x) => ({
      ...x,
      make_model: makeModel || x.make_model,
      year: v.year != null ? String(v.year) : x.year,
      colour: v.colour ?? x.colour,
      fuel_type: v.fuel ?? x.fuel_type,
      name: x.name.trim() ? x.name : [makeModel, normaliseRegistration(x.registration)].filter(Boolean).join(" "),
      meter_reading: x.meter_reading.trim() || v.mileage == null ? x.meter_reading : String(v.mileage),
      meter_unit: v.mileage != null && !x.meter_reading.trim() ? "miles" : x.meter_unit,
    }));
  };
  const applyVin = (v: VinLookup) => {
    const makeModel = [v.make, v.model].filter(Boolean).join(" ");
    setF((x) => ({
      ...x,
      make_model: x.make_model.trim() ? x.make_model : makeModel,
      year: x.year.trim() || v.year == null ? x.year : String(v.year),
      fuel_type: x.fuel_type.trim() ? x.fuel_type : v.fuel ?? "",
      name: x.name.trim() ? x.name : [v.year, makeModel].filter(Boolean).join(" "),
    }));
    toast.success([v.year, v.make, v.model, v.body].filter(Boolean).join(" · "));
  };

  const save = async () => {
    if (!f.name.trim()) return toast.error(`Give the ${profile.asset.singular} a name, e.g. ${profile.intake.makePlaceholder.replace(/^e\.g\. /, "")}`);
    const reading = num(f.meter_reading);
    if (reading != null && (Number.isNaN(reading) || reading < 0)) return toast.error("The reading must be a number of 0 or more");
    const year = num(f.year);
    if (vehicle && year != null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) return toast.error("Enter the year as four digits, e.g. 2019");
    const input: AssetInput = {
      client_id: noClient ? null : f.client,
      owner_name: noClient ? f.owner_name.trim() || null : null,
      owner_phone: noClient ? f.owner_phone.trim() || null : null,
      owner_email: noClient ? f.owner_email.trim() || null : null,
      kind: f.kind,
      name: f.name.trim(),
      make_model: f.make_model.trim() || null,
      year_of_manufacture: vehicle ? year : asset?.year_of_manufacture ?? null,
      colour: vehicle ? f.colour.trim() || null : asset?.colour ?? null,
      fuel_type: vehicle ? f.fuel_type.trim() || null : asset?.fuel_type ?? null,
      serial_number: f.serial_number.trim() || null,
      registration: f.registration.trim() ? normaliseRegistration(f.registration) : null,
      vin: f.vin.trim().toUpperCase() || null,
      fleet_number: f.fleet_number.trim() || null,
      meter_unit: f.meter_unit,
      meter_reading: reading,
      notes: f.notes.trim() || null,
    };
    setSaving(true);
    try {
      const id = await actions.saveAsset(input, asset?.id);
      let mot = "";
      if (vehicle && found?.mot_expiry) {
        const done = await ensureMotReminder(id, found.mot_expiry);
        if (done !== "unchanged") mot = `. MOT reminder ${done === "added" ? "added" : "moved"} to ${new Date(`${found.mot_expiry}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
      }
      toast.success(`${asset ? "Saved" : `${input.name} added`}${mot}`);
      onOpenChange(false);
      onSaved?.(id);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.name}` : `Add a ${profile.asset.singular}`}</DialogTitle>
          <DialogDescription>Its service history builds up from every project it comes in for.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="asset-owner">Owner</Label>
            <Select value={f.client} onValueChange={(v) => set("client", v)}>
              <SelectTrigger id="asset-owner"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>Walk-in or phone customer (no portal account)</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{clientLabel(c, profile.customer.personFirst)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {noClient && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="asset-owner-name">Name</Label><Input id="asset-owner-name" value={f.owner_name} onChange={(e) => set("owner_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="asset-owner-phone">Phone</Label><Input id="asset-owner-phone" type="tel" value={f.owner_phone} onChange={(e) => set("owner_phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="asset-owner-email">Email</Label><Input id="asset-owner-email" type="email" value={f.owner_email} onChange={(e) => set("owner_email", e.target.value)} /></div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="asset-kind">Type</Label>
              <Select value={f.kind} onValueChange={(v) => set("kind", v as AssetKind)}>
                <SelectTrigger id="asset-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSET_KIND_LABEL) as AssetKind[]).map((k) => <SelectItem key={k} value={k}>{ASSET_KIND_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="asset-name">Name</Label>
              <Input id="asset-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={profile.intake.makePlaceholder} maxLength={200} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-make">Make and model</Label>
            <Input id="asset-make" value={f.make_model} onChange={(e) => set("make_model", e.target.value)} placeholder={profile.intake.makePlaceholder} />
          </div>
          {vehicle && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="asset-year">Year</Label><Input id="asset-year" inputMode="numeric" maxLength={4} value={f.year} onChange={(e) => set("year", e.target.value)} placeholder="e.g. 2019" /></div>
              <div className="space-y-1.5"><Label htmlFor="asset-colour">Colour</Label><Input id="asset-colour" maxLength={50} value={f.colour} onChange={(e) => set("colour", e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="asset-fuel">Fuel</Label><Input id="asset-fuel" maxLength={50} value={f.fuel_type} onChange={(e) => set("fuel_type", e.target.value)} placeholder="e.g. Diesel" /></div>
            </div>
          )}
          {vehicle ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="asset-reg">Registration</Label>
                <div className="flex gap-2">
                  <Input id="asset-reg" value={f.registration} onChange={(e) => { set("registration", e.target.value); setFound(null); }} className="font-mono uppercase" />
                  <VehicleLookupButton registration={f.registration} onFound={applyVehicle} />
                </div>
                {found && <p className="text-xs text-muted-foreground" data-testid="vehicle-summary">{describeVehicle(found)}</p>}
                {found && describeMotHistory(found) && <p className="text-xs text-muted-foreground">{describeMotHistory(found)}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <div className="space-y-1.5"><Label htmlFor="asset-fleet">Fleet number</Label><Input id="asset-fleet" value={f.fleet_number} onChange={(e) => set("fleet_number", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="asset-vin">VIN</Label>
                  <div className="flex gap-2">
                    <Input id="asset-vin" value={f.vin} onChange={(e) => set("vin", e.target.value)} className="font-mono uppercase" maxLength={17} />
                    <VinDecodeButton vin={f.vin} onFound={applyVin} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="asset-serial">{profile.intake.serialLabel}</Label>
              <Input id="asset-serial" value={f.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="asset-meter">Current reading</Label>
              <Input id="asset-meter" inputMode="decimal" value={f.meter_reading} onChange={(e) => set("meter_reading", e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-unit">Measured in</Label>
              <Select value={f.meter_unit} onValueChange={(v) => set("meter_unit", v as MeterUnit)}>
                <SelectTrigger id="asset-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METER_LABEL) as MeterUnit[]).map((u) => <SelectItem key={u} value={u}>{METER_LABEL[u]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-notes">Notes</Label>
            <Textarea id="asset-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Location, access, anything the next technician should know" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : asset ? "Save" : `Add ${profile.asset.singular}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Add or edit a service reminder, from a preset or by hand. */
export function ReminderDialog({
  open,
  onOpenChange,
  asset,
  reminder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: Asset;
  reminder?: AssetReminder | null;
}) {
  const profile = useIndustry();
  const actions = useAssetActions();
  const unit = asset.meter_unit ?? profile.asset.meterUnit;
  const blank = () => ({
    title: reminder?.title ?? "",
    interval_months: reminder?.interval_months != null ? String(reminder.interval_months) : "",
    interval_meter: reminder?.interval_meter != null ? String(reminder.interval_meter) : "",
    due_date: reminder?.due_date ?? "",
    due_meter: reminder?.due_meter != null ? String(reminder.due_meter) : "",
    notes: reminder?.notes ?? "",
  });
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setF(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reminder?.id]);
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }));

  const applyPreset = (title: string) => {
    const p = profile.reminderPresets.find((x) => x.title === title);
    if (!p) return;
    setF((x) => ({
      ...x,
      title: p.title,
      interval_months: p.months ? String(p.months) : "",
      interval_meter: p.meter ? String(p.meter) : "",
      due_date: p.months ? firstDueDate(p.months) : "",
      due_meter: p.meter && asset.meter_reading != null ? String(Math.round(asset.meter_reading + p.meter)) : "",
    }));
  };

  const save = async () => {
    if (!f.title.trim()) return toast.error("Say what the service or inspection is");
    const months = num(f.interval_months), meter = num(f.interval_meter), dueMeter = num(f.due_meter);
    if ([months, meter, dueMeter].some((v) => v != null && (Number.isNaN(v) || v < 0))) return toast.error("Intervals and readings must be numbers");
    if (months != null && (months < 1 || months > 120 || !Number.isInteger(months))) return toast.error("Months must be a whole number from 1 to 120");
    if (!f.due_date && dueMeter == null) return toast.error(`Set when it's next due: a date, a reading in ${unit}, or both`);
    setSaving(true);
    try {
      await actions.saveReminder(asset.id, {
        title: f.title.trim(),
        interval_months: months,
        interval_meter: meter,
        due_date: f.due_date || null,
        due_meter: dueMeter,
        active: true,
        notes: f.notes.trim() || null,
      }, reminder?.id);
      toast.success(reminder ? "Reminder saved" : "Reminder added");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "Add a service reminder"}</DialogTitle>
          <DialogDescription>
            The owner and your team are told when it's coming due. Marking it done sets the next one from the interval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!reminder && (
            <div className="flex flex-wrap gap-2" aria-label="Common services">
              {profile.reminderPresets.map((p) => (
                <button key={p.title} type="button" onClick={() => applyPreset(p.title)} className="rounded-full border px-3 py-1 text-sm hover:bg-secondary">
                  {p.title}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rem-title">Service or inspection</Label>
            <Input id="rem-title" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Annual service" maxLength={120} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rem-months">Repeat every (months)</Label>
              <Input id="rem-months" inputMode="numeric" value={f.interval_months} onChange={(e) => set("interval_months", e.target.value)} placeholder="e.g. 12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-meter">or every ({unit})</Label>
              <Input id="rem-meter" inputMode="decimal" value={f.interval_meter} onChange={(e) => set("interval_meter", e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rem-due">Next due on</Label>
              <DatePickerInput id="rem-due" value={f.due_date} onChange={(v) => set("due_date", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-due-meter">or at ({unit})</Label>
              <Input id="rem-due-meter" inputMode="decimal" value={f.due_meter} onChange={(e) => set("due_meter", e.target.value)} placeholder={asset.meter_reading != null ? `Now ${Math.round(asset.meter_reading)}` : "Optional"} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Leave both repeat boxes empty for a one-off; marking it done finishes it.</p>
          <div className="space-y-1.5">
            <Label htmlFor="rem-notes">Notes</Label>
            <Textarea id="rem-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save reminder"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Record that a service was done; the reminder rolls forward. */
export function CompleteReminderDialog({
  open,
  onOpenChange,
  asset,
  reminder,
  jobs,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: Asset;
  reminder: AssetReminder | null;
  jobs: { id: string; ref: string | null; title: string }[];
}) {
  const actions = useAssetActions();
  const profile = useIndustry();
  const unit = asset.meter_unit ?? profile.asset.meterUnit;
  const [doneOn, setDoneOn] = useState(today());
  const [meter, setMeter] = useState("");
  const [job, setJob] = useState("__none__");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setDoneOn(today());
      setMeter(asset.meter_reading != null ? String(Math.round(asset.meter_reading)) : "");
      setJob(jobs[0]?.id ?? "__none__");
    }
  }, [open, asset.meter_reading, jobs]);
  if (!reminder) return null;

  const save = async () => {
    const m = num(meter);
    if (m != null && (Number.isNaN(m) || m < 0)) return toast.error("The reading must be a number of 0 or more");
    setSaving(true);
    try {
      await actions.completeReminder(asset.id, reminder.id, doneOn || today(), m, job === "__none__" ? null : job);
      toast.success(`${reminder.title} recorded`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark "{reminder.title}" done</DialogTitle>
          <DialogDescription>The next one is set from its interval, and the owner is reminded again when that comes due.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="done-on">Done on</Label>
              <DatePickerInput id="done-on" value={doneOn} onChange={setDoneOn} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="done-meter">Reading ({unit})</Label>
              <Input id="done-meter" inputMode="decimal" value={meter} onChange={(e) => setMeter(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {jobs.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="done-job">Done on project</Label>
              <Select value={job} onValueChange={setJob}>
                <SelectTrigger id="done-job"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not linked to a project</SelectItem>
                  {jobs.map((j) => <SelectItem key={j.id} value={j.id}>{j.ref ? `${j.ref} · ${j.title}` : j.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Mark done"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
