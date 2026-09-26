import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { projectPath } from "@/lib/projects";
import { cn } from "@/lib/utils";

export type IntakeType = "evaluation" | "quote" | "approved";

export interface IntakePrefill {
  requestId?: string;
  clientId?: string | null;
  title?: string;
  description?: string | null;
  intakeType?: IntakeType;
  dueDate?: string | null;
  priority?: string;
}

export type ReceptionClient = { id: string; full_name: string | null; company_name: string | null; phone: string | null; email: string | null };

export const clientLabel = (c: ReceptionClient) =>
  c.company_name ? `${c.company_name}${c.full_name ? ` · ${c.full_name}` : ""}` : c.full_name || c.email || "Unnamed client";

const INTAKE_OPTIONS: { value: IntakeType; label: string; description: string }[] = [
  { value: "evaluation", label: "Evaluation", description: "Assess the machine first. Evaluations are free." },
  { value: "quote", label: "Quote", description: "The client wants a price before any work starts." },
  { value: "approved", label: "Approved job", description: "The client has already agreed. Plan the work straight away." },
];

const WALK_IN = "__walk_in__";

/**
 * Everything reception records when a machine comes in. Creates the project
 * (and its permanent ID) in one step, then attaches the arrival photos.
 */
export default function IntakeForm({ clients, prefill, onCancel }: { clients: ReceptionClient[]; prefill?: IntakePrefill; onCancel?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    client: prefill?.clientId ?? WALK_IN,
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    title: prefill?.title ?? "",
    make_model: "",
    serial_number: "",
    accessories: "",
    description: prefill?.description ?? "",
    condition_notes: "",
    intake_type: prefill?.intakeType ?? ("evaluation" as IntakeType),
    priority: prefill?.priority ?? "medium",
    due_date: prefill?.dueDate ?? "",
  });
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Say what the machine is or what the work is");
    if (walkIn && !form.contact_name.trim() && !form.contact_phone.trim()) return toast.error("Add the customer's name or phone number");
    setSaving(true);
    const { data: id, error } = await supabase.rpc("create_project", {
      _p: {
        title: form.title,
        description: form.description,
        client_id: walkIn ? null : form.client,
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
      },
    });
    if (error || !id) {
      setSaving(false);
      return toast.error(error?.message ?? "Couldn't log the project. Try again.");
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
    toast.success(`${job?.ref ?? "Project"} logged${failed ? `. ${failed} photo${failed > 1 ? "s" : ""} didn't upload; add them on the project page.` : ""}`);
    navigate(projectPath(id));
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Customer</legend>
        <div>
          <Label htmlFor="f-intake-client">Client</Label>
          <Select value={form.client} onValueChange={(v) => set("client", v)}>
            <SelectTrigger id="f-intake-client">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WALK_IN}>Walk-in or phone customer (no portal account)</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {clientLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Machine</legend>
        <div>
          <Label htmlFor="f-intake-title">What's come in</Label>
          <Input id="f-intake-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Lathe, spindle noisy under load" maxLength={200} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="f-intake-make">Make and model</Label>
            <Input id="f-intake-make" value={form.make_model} onChange={(e) => set("make_model", e.target.value)} placeholder="e.g. Colchester Student 1800" />
          </div>
          <div>
            <Label htmlFor="f-intake-serial">Serial or asset number</Label>
            <Input id="f-intake-serial" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
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
            Add photos of the machine
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
