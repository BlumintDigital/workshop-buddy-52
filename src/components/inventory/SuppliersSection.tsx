import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddressInput } from "@/components/lookup/AddressInput";

export type SupplierRow = { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null; notes: string | null };

/** Who stores buys from. Contact details are shown as text to copy, not as links. */
export default function SuppliersSection({ suppliers, canManage, onChanged }: { suppliers: SupplierRow[]; canManage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState<SupplierRow | "new" | null>(null);

  const columns: Column<SupplierRow>[] = [
    { key: "name", header: "Supplier", cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "contact", header: "Contact", cell: (s) => s.contact_name ?? "—", hideBelow: "md" },
    { key: "phone", header: "Phone", cell: (s) => <span className="select-all tabular-nums">{s.phone ?? "—"}</span> },
    { key: "email", header: "Email", cell: (s) => <span className="select-all">{s.email ?? "—"}</span>, hideBelow: "lg" },
  ];

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Add supplier
          </Button>
        </div>
      )}
      <DataList
        rows={suppliers}
        columns={columns}
        getRowKey={(s) => s.id}
        actions={canManage ? (s) => <Button size="sm" variant="outline" onClick={() => setEditing(s)}>Edit<span className="sr-only"> {s.name}</span></Button> : undefined}
        mobile={{ title: (s) => s.name, meta: (s) => [s.contact_name, s.phone, s.email].filter(Boolean).join(" · ") }}
        empty={<EmptyState title="No suppliers yet" description="Add the companies you buy parts from so purchase orders can go to them." />}
      />
      {editing && (
        <SupplierDialog
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function SupplierDialog({ supplier, onClose, onSaved }: { supplier: SupplierRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    contact_name: supplier?.contact_name ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the supplier a name");
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = supplier ? await supabase.from("suppliers").update(payload).eq("id", supplier.id) : await supabase.from("suppliers").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.code === "23505" ? "A supplier with that name already exists" : error.message);
    toast.success(supplier ? `${payload.name} saved` : `${payload.name} added`);
    onSaved();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : "Add a supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="f-sup-name">Name</Label>
            <Input id="f-sup-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-sup-contact">Contact person</Label>
            <Input id="f-sup-contact" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="f-sup-phone">Phone</Label>
            <Input id="f-sup-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-sup-email">Email</Label>
            <Input id="f-sup-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-sup-address">Address</Label>
            <AddressInput id="f-sup-address" value={form.address} onChange={(v) => set("address", v)} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="f-sup-notes">Notes</Label>
            <Textarea id="f-sup-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Account number, lead times, minimum order" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : supplier ? "Save supplier" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
