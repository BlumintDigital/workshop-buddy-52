import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, ChevronsUpDown, Link2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { projectPath } from "@/lib/projects";
import { useFeature } from "@/hooks/useFeatureFlags";
import { ensureMotReminder, fillAssetDetails, findAssets, type Asset } from "@/hooks/useAssets";
import { VehicleLookupButton } from "@/components/lookup/VehicleLookupButton";
import { describeMotHistory, describeVehicle, vehicleMakeModel, type VehicleLookup } from "@/lib/lookup";
import { assetSummary, normaliseRegistration, useIndustry } from "@/lib/industry";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage } from "@/lib/friendlyError";

export type IntakeType = "evaluation" | "quote" | "approved";

export interface IntakePrefill {
  requestId?: string;
  /** The appointment this machine came in from; linked to the new project. */
  appointmentId?: string;
  /** The asset this project is for (from its page, or a client request about it). */
  assetId?: string | null;
  clientId?: string | null;
  title?: string;
  description?: string | null;
  intakeType?: IntakeType;
  dueDate?: string | null;
  priority?: string;
}

/** A registered client. `portal` is false when they have no portal access (they can still have projects). */
export type ReceptionClient = { id: string; full_name: string | null; company_name: string | null; phone: string | null; email: string | null; portal?: boolean };

/** "Company · person", or "Person · company" for workshops that deal with people (garages). */
export const clientLabel = (c: ReceptionClient, personFirst = false) => {
  const [a, b] = personFirst ? [c.full_name, c.company_name] : [c.company_name, c.full_name];
  return a ? `${a}${b && b !== a ? ` · ${b}` : ""}` : b || c.email || "Unnamed client";
};

const INTAKE_OPTIONS: { value: IntakeType; label: string; description: string }[] = [
  { value: "evaluation", label: "Evaluation", description: "Assess the machine first. Evaluations are free." },
  { value: "quote", label: "Quote", description: "The client wants a price before any work starts." },
  { value: "approved", label: "Approved job", description: "The client has already agreed. Plan the work straight away." },
];

// Who the project is for: a registered client (their id, or "" until one is picked), a new
// client saved as we log it, or a one-off customer kept only on this project.
const WALK_IN = "__walk_in__";
const NEW_CLIENT = "__new_client__";

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
/** A registered client with the same email, or the same phone number (last 9 digits), if any. */
export function findExistingClient(clients: ReceptionClient[], email: string, phone: string): ReceptionClient | undefined {
  const e = email.trim().toLowerCase();
  const p = digits(phone).slice(-9);
  return clients.find((c) => (e && c.email?.toLowerCase() === e) || (p.length === 9 && digits(c.phone).slice(-9) === p));
}

/**
 * Everything reception records when a machine comes in. Creates the project
 * (and its permanent ID) in one step, then attaches the arrival photos.
 */
export default function IntakeForm({ clients, prefill, onCancel }: { clients: ReceptionClient[]; prefill?: IntakePrefill; onCancel?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const profile = useIndustry();
  const assetsOn = useFeature("assets");
  const [form, setForm] = useState({
    client: prefill?.clientId ?? (clients.length ? "" : NEW_CLIENT),
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    title: prefill?.title ?? "",
    make_model: "",
    year: "",
    serial_number: "",
    registration: "",
    meter_reading: "",
    accessories: "",
    description: prefill?.description ?? "",
    condition_notes: "",
    intake_type: prefill?.intakeType ?? ("evaluation" as IntakeType),
    priority: prefill?.priority ?? "medium",
    due_date: prefill?.dueDate ?? "",
  });
  const [newClient, setNewClient] = useState({ name: "", company: "", phone: "", email: "" });
  // Clients registered from this form, so the picker can show them if logging the project fails.
  const [added, setAdded] = useState<ReceptionClient[]>([]);
  const allClients = [...clients, ...added];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const walkIn = form.client === WALK_IN;
  const isNewClient = form.client === NEW_CLIENT;
  const existing = !walkIn && !isNewClient;
  const personFirst = profile.customer.personFirst;
  const picked = existing ? allClients.find((c) => c.id === form.client) : undefined;
  // Typing the details of someone who's already a client: offer to use their record instead.
  const duplicate = walkIn
    ? findExistingClient(allClients, form.contact_email, form.contact_phone)
    : isNewClient
      ? findExistingClient(allClients, newClient.email, newClient.phone)
      : undefined;

  // ---- Registration lookup: fills make and model and the mileage, and remembers the MOT date
  // so the asset gets an MOT reminder when the project is saved.
  const [vehicle, setVehicle] = useState<VehicleLookup | null>(null);
  const applyVehicle = (v: VehicleLookup) => {
    setVehicle(v);
    const makeModel = vehicleMakeModel(v);
    setForm((f) => ({
      ...f,
      make_model: makeModel || f.make_model,
      year: v.year != null ? String(v.year) : f.year,
      title: f.title.trim() ? f.title : makeModel,
      meter_reading: f.meter_reading.trim() || v.mileage == null ? f.meter_reading : String(v.mileage),
    }));
  };

  // ---- The asset this is for: picked from the client's list, found by registration or serial,
  // or saved as a new one so its service history starts here.
  const [asset, setAsset] = useState<Asset | null>(null);
  const isVehicle = profile.intake.showRegistration || asset?.kind === "vehicle";
  const [saveAsset, setSaveAsset] = useState(true);
  const [clientAssets, setClientAssets] = useState<Asset[]>([]);
  const [assetQuery, setAssetQuery] = useState("");
  const [matches, setMatches] = useState<Asset[]>([]);

  const pickAsset = (a: Asset) => {
    setAsset(a);
    setAssetQuery("");
    setMatches([]);
    setForm((f) => ({
      ...f,
      make_model: a.make_model ?? f.make_model,
      serial_number: a.serial_number ?? f.serial_number,
      registration: a.registration ?? f.registration,
      client: a.client_id && clients.some((c) => c.id === a.client_id) ? a.client_id : a.client_id ? f.client : WALK_IN,
      contact_name: !a.client_id && a.owner_name ? a.owner_name : f.contact_name,
      contact_phone: !a.client_id && a.owner_phone ? a.owner_phone : f.contact_phone,
      contact_email: !a.client_id && a.owner_email ? a.owner_email : f.contact_email,
    }));
  };

  useEffect(() => {
    if (!assetsOn || !prefill?.assetId) return;
    void supabase.from("assets").select("*").eq("id", prefill.assetId).maybeSingle().then(({ data }) => {
      if (data) pickAsset(data as Asset);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsOn, prefill?.assetId]);

  useEffect(() => {
    if (!assetsOn || !existing || !form.client) {
      setClientAssets([]);
      return;
    }
    let cancelled = false;
    void findAssets({ clientId: form.client }).then((list) => !cancelled && setClientAssets(list));
    return () => {
      cancelled = true;
    };
  }, [assetsOn, existing, form.client]);

  useEffect(() => {
    const q = assetQuery.trim();
    if (!assetsOn || q.length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void findAssets({ query: q }).then((list) => !cancelled && setMatches(list));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [assetsOn, assetQuery]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Say what the machine is or what the work is");
    if (existing && !form.client) return toast.error("Pick the client, or choose New client");
    if (walkIn && !form.contact_name.trim() && !form.contact_phone.trim()) return toast.error("Add the customer's name or phone number");
    const newName = (personFirst ? newClient.name : newClient.company).trim();
    if (isNewClient && !newName) return toast.error(personFirst ? "Add the client's name" : "Add the company name");
    if (isNewClient && !/^\S+@\S+\.\S+$/.test(newClient.email.trim())) return toast.error("Add the client's email to save them. No email? Choose One-off.");
    const reading = form.meter_reading.trim() === "" ? null : Number(form.meter_reading);
    if (reading != null && (Number.isNaN(reading) || reading < 0)) return toast.error("The reading must be a number of 0 or more");
    const year = !isVehicle || form.year.trim() === "" ? null : Number(form.year);
    if (year != null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) return toast.error("Enter the year as four digits, e.g. 2019");
    setSaving(true);
    let clientId: string | null = existing ? form.client : null;
    if (isNewClient) {
      const { data, error: addErr } = await supabase.functions.invoke("create-client", {
        body: {
          email: newClient.email.trim(),
          full_name: newName,
          phone: newClient.phone.trim() || undefined,
          company_name: personFirst ? newClient.company.trim() || undefined : newName,
          contact_person: personFirst ? undefined : newClient.name.trim() || undefined,
          portal: false,
        },
      });
      const addMsg = (data as { error?: string } | null)?.error;
      if (addErr || addMsg || !data?.user_id) {
        setSaving(false);
        // Show the server's reason (for example "Enter your 2FA code to continue"), not a generic line.
        return toast.error(addMsg ?? (await friendlyErrorMessage(addErr, "Couldn't save the new client. Try again.")));
      }
      clientId = data.user_id as string;
      // From here on they're a registered client: if logging the project fails, a retry uses them.
      setAdded((a) => [
        ...a,
        {
          id: clientId!,
          full_name: newName,
          company_name: personFirst ? newClient.company.trim() || null : newName,
          phone: newClient.phone.trim() || null,
          email: newClient.email.trim(),
          portal: false,
        },
      ]);
      set("client", clientId);
    }
    const { data: id, error } = await supabase.rpc("create_project", {
      _p: {
        title: form.title,
        description: form.description,
        client_id: clientId,
        contact_name: walkIn ? form.contact_name : "",
        contact_phone: walkIn ? form.contact_phone : "",
        contact_email: walkIn ? form.contact_email : "",
        make_model: form.make_model,
        serial_number: form.serial_number,
        accessories: form.accessories,
        condition_notes: form.condition_notes,
        intake_type: form.intake_type,
        priority: form.priority,
        due_date: form.due_date,
        source_request_id: prefill?.requestId ?? "",
        registration: form.registration.trim() ? normaliseRegistration(form.registration) : "",
        meter_reading: reading ?? "",
        asset_id: asset?.id ?? "",
        save_asset: assetsOn && !asset && saveAsset,
        asset_kind: profile.asset.kind,
        meter_unit: profile.asset.meterUnit,
      },
    });
    if (error || !id) {
      setSaving(false);
      return toast.error(error?.message ?? "Couldn't log the project. Try again.");
    }
    if (prefill?.appointmentId) await supabase.rpc("link_appointment_to_project", { _appointment_id: prefill.appointmentId, _job_id: id });
    // Year, colour and fuel live on the asset; fill in whichever it doesn't have yet.
    let motNote = "";
    const extras = { year_of_manufacture: year, colour: vehicle?.colour ?? null, fuel_type: vehicle?.fuel ?? null };
    const wantsMot = isVehicle && !!vehicle?.mot_expiry;
    if (assetsOn && (wantsMot || Object.values(extras).some((v) => v != null))) {
      const assetId = asset?.id ?? (await supabase.from("jobs").select("asset_id").eq("id", id).single()).data?.asset_id;
      if (assetId) {
        await fillAssetDetails(assetId, extras);
        if (wantsMot) {
          const done = await ensureMotReminder(assetId, vehicle!.mot_expiry!);
          if (done !== "unchanged") motNote = `. MOT reminder ${done === "added" ? "added" : "moved"} to ${new Date(`${vehicle!.mot_expiry}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
        }
      }
    }
    let failed = 0;
    for (const file of photos) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `${id}/intake/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (upErr) {
        failed++;
        continue;
      }
      const { error: rowErr } = await supabase.from("job_attachments").insert({
        job_id: id,
        uploaded_by: user!.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || "image/jpeg",
        file_size: file.size,
        kind: "intake",
      });
      if (rowErr) failed++;
    }
    const { data: job } = await supabase.from("jobs").select("ref").eq("id", id).single();
    setSaving(false);
    toast.success(`${job?.ref ?? "Project"} logged${isNewClient ? ` and ${newName} saved to your clients` : ""}${motNote}${failed ? `. ${failed} photo${failed > 1 ? "s" : ""} didn't upload; add them on the project page.` : ""}`);
    navigate(projectPath(id));
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Customer</legend>
        <div role="radiogroup" aria-label="Who it's for" className="grid grid-cols-3 gap-2">
          {[
            { value: "existing", label: "Existing client", on: existing, pick: () => set("client", picked?.id ?? "") },
            { value: "new", label: "New client", on: isNewClient, pick: () => set("client", NEW_CLIENT) },
            { value: "oneoff", label: "One-off", on: walkIn, pick: () => set("client", WALK_IN) },
          ].map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={o.on}
              onClick={o.pick}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                o.on ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-secondary",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {existing && (
          <div>
            <Label htmlFor="f-intake-client">Client</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button id="f-intake-client" type="button" variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full justify-between font-normal">
                  <span className={cn("truncate", !picked && "text-muted-foreground")}>
                    {picked ? clientLabel(picked, personFirst) : allClients.length ? "Search by name, phone or email" : "No clients registered yet"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name, phone or email" />
                  <CommandList>
                    <CommandEmpty>
                      No client found.{" "}
                      <button type="button" className="text-primary underline" onClick={() => { setPickerOpen(false); set("client", NEW_CLIENT); }}>
                        Add a new client
                      </button>
                    </CommandEmpty>
                    <CommandGroup>
                      {allClients.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${clientLabel(c, personFirst)} ${c.phone ?? ""} ${c.email ?? ""} ${c.id}`}
                          onSelect={() => { set("client", c.id); setPickerOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4 shrink-0", form.client === c.id ? "opacity-100" : "opacity-0")} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{clientLabel(c, personFirst)}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
                              {c.portal === false && " · No portal"}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {picked && (
              <p className="mt-1 text-xs text-muted-foreground">
                {picked.portal === false
                  ? "This client doesn't use the portal. The project is still saved under their name."
                  : "They'll see this project in their portal."}
              </p>
            )}
          </div>
        )}
        {isNewClient && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="f-new-client-primary">{personFirst ? "Name" : "Company"}</Label>
                <Input
                  id="f-new-client-primary"
                  value={personFirst ? newClient.name : newClient.company}
                  onChange={(e) => setNewClient((c) => ({ ...c, [personFirst ? "name" : "company"]: e.target.value }))}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="f-new-client-secondary">{personFirst ? "Company (optional)" : "Contact person (optional)"}</Label>
                <Input
                  id="f-new-client-secondary"
                  value={personFirst ? newClient.company : newClient.name}
                  onChange={(e) => setNewClient((c) => ({ ...c, [personFirst ? "company" : "name"]: e.target.value }))}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="f-new-client-phone">Phone</Label>
                <Input id="f-new-client-phone" type="tel" value={newClient.phone} onChange={(e) => setNewClient((c) => ({ ...c, phone: e.target.value }))} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="f-new-client-email">Email</Label>
                <Input id="f-new-client-email" type="email" value={newClient.email} onChange={(e) => setNewClient((c) => ({ ...c, email: e.target.value }))} autoComplete="off" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Saved to your clients so you can pick them next time. They won't get portal access until an admin turns it on in Clients. No email? Choose One-off.
            </p>
          </div>
        )}
        {walkIn && (
          <p className="text-xs text-muted-foreground">Kept on this project only, not saved to your clients.</p>
        )}
        {walkIn && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="f-intake-contact-name">Name</Label>
              <Input id="f-intake-contact-name" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="f-intake-contact-phone">Phone</Label>
              <Input id="f-intake-contact-phone" type="tel" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="f-intake-contact-email">Email (optional)</Label>
              <Input id="f-intake-contact-email" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} autoComplete="off" />
            </div>
          </div>
        )}
        {duplicate && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <strong>{clientLabel(duplicate, personFirst)}</strong> is already a client with these details.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => set("client", duplicate.id)}>
              Use their record
            </Button>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">{profile.intake.section}</legend>
        {assetsOn && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            {asset ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-primary" aria-hidden />
                <span>
                  Linked to <strong>{assetSummary(asset)}</strong>. This project joins its service history.
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setAsset(null)}>Change</Button>
              </div>
            ) : (
              <>
                {clientAssets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Their {profile.asset.plural}:</span>
                    {clientAssets.slice(0, 8).map((a) => (
                      <button key={a.id} type="button" onClick={() => pickAsset(a)} className="rounded-full border bg-card px-3 py-1 text-sm hover:bg-secondary">
                        {assetSummary(a)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    aria-label={profile.intake.findPlaceholder}
                    value={assetQuery}
                    onChange={(e) => setAssetQuery(e.target.value)}
                    placeholder={`${profile.intake.findPlaceholder} (been in before?)`}
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
                {matches.length > 0 && (
                  <ul className="divide-y rounded-md border bg-card">
                    {matches.map((a) => (
                      <li key={a.id}>
                        <button type="button" onClick={() => pickAsset(a)} className="w-full px-3 py-2 text-left text-sm hover:bg-secondary">
                          <span className="font-medium">{assetSummary(a)}</span>
                          {a.make_model && <span className="text-muted-foreground"> · {a.make_model}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <div>
          <Label htmlFor="f-intake-title">What's come in</Label>
          <Input id="f-intake-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={profile.intake.titlePlaceholder} maxLength={200} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isVehicle && (
            <div>
              <Label htmlFor="f-intake-reg">Registration</Label>
              <div className="flex gap-2">
                <Input id="f-intake-reg" value={form.registration} onChange={(e) => { set("registration", e.target.value); setVehicle(null); }} className="font-mono uppercase" autoComplete="off" />
                <VehicleLookupButton registration={form.registration} onFound={applyVehicle} />
              </div>
              {vehicle && <p className="mt-1 text-xs text-muted-foreground" data-testid="vehicle-summary">{describeVehicle(vehicle)}</p>}
              {vehicle && describeMotHistory(vehicle) && <p className="text-xs text-muted-foreground">{describeMotHistory(vehicle)}</p>}
            </div>
          )}
          <div>
            <Label htmlFor="f-intake-make">Make and model</Label>
            {isVehicle ? (
              <div className="flex gap-2">
                <Input id="f-intake-make" value={form.make_model} onChange={(e) => set("make_model", e.target.value)} placeholder={profile.intake.makePlaceholder} className="min-w-0 flex-1" />
                <Input id="f-intake-year" aria-label="Year of manufacture" inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="Year" className="w-20" />
              </div>
            ) : (
              <Input id="f-intake-make" value={form.make_model} onChange={(e) => set("make_model", e.target.value)} placeholder={profile.intake.makePlaceholder} />
            )}
          </div>
          {(profile.intake.showSerial || (asset && asset.kind !== "vehicle")) && (
            <div>
              <Label htmlFor="f-intake-serial">{profile.intake.serialLabel}</Label>
              <Input id="f-intake-serial" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="f-intake-meter">{profile.intake.meterLabel}</Label>
            <Input id="f-intake-meter" inputMode="decimal" value={form.meter_reading} onChange={(e) => set("meter_reading", e.target.value)} placeholder={asset?.meter_reading != null ? `Last: ${Math.round(asset.meter_reading).toLocaleString()}` : undefined} />
          </div>
        </div>
        <div>
          <Label htmlFor="f-intake-problem">Reported problem</Label>
          <Textarea id="f-intake-problem" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="What the customer says is wrong, in their words" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-intake-accessories">Received with it</Label>
            <Textarea id="f-intake-accessories" value={form.accessories} onChange={(e) => set("accessories", e.target.value)} rows={2} placeholder="e.g. Chuck key, 3 jaws, manual" />
          </div>
          <div>
            <Label htmlFor="f-intake-condition">Condition on arrival</Label>
            <Textarea id="f-intake-condition" value={form.condition_notes} onChange={(e) => set("condition_notes", e.target.value)} rows={2} placeholder="Damage, missing parts, anything you'd want on record" />
          </div>
        </div>
        <div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])])}
          />
          <Button type="button" variant="outline" onClick={() => photoInput.current?.click()}>
            <Camera className="mr-1.5 h-4 w-4" aria-hidden />
            Add photos of the {profile.asset.singular}
          </Button>
          {previews.length > 0 && (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {previews.map((url, i) => (
                <li key={url} className="relative overflow-hidden rounded-md border">
                  <img src={url} alt={photos[i]?.name ?? `Photo ${i + 1}`} className="h-20 w-full object-cover" />
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-1 top-1 h-8 w-8"
                    aria-label={`Remove ${photos[i]?.name ?? "photo"}`}
                    onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Arrival photos are locked once saved and the client can see them.</p>
        </div>
        {assetsOn && !asset && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={saveAsset} onCheckedChange={(v) => setSaveAsset(v === true)} className="mt-0.5" />
            <span>
              Save to the customer's {profile.asset.plural}, so its service history and reminders build up
            </span>
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">What the customer wants</legend>
        <div role="radiogroup" aria-label="Intake type" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {INTAKE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={form.intake_type === o.value}
              onClick={() => set("intake_type", o.value)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                form.intake_type === o.value ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-secondary",
              )}
            >
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-intake-priority">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
              <SelectTrigger id="f-intake-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="f-intake-due">Wanted by (optional)</Label>
            <DatePickerInput id="f-intake-due" value={form.due_date ?? ""} onChange={(v) => set("due_date", v)} />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Logging…" : "Log project"}
        </Button>
      </div>
    </form>
  );
}
