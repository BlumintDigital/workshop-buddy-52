import { useEffect, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { ListPagination } from "@/components/list/ListPagination";
import { EmptyState } from "@/components/list/EmptyState";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { customerName, useIndustry } from "@/lib/industry";
import { AddressInput } from "@/components/lookup/AddressInput";

type ClientRow = {
  user_id: string;
  company_name: string | null;
  contact_person: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  is_active: boolean;
};

type ClientForm = { name: string; company: string; contact: string; email: string; phone: string; address: string };
const EMPTY_FORM: ClientForm = { name: "", company: "", contact: "", email: "", phone: "", address: "" };



export default function AdminClients() {
  const profile = useIndustry();
  const personFirst = profile.customer.personFirst;
  const displayName = (c: ClientRow) => customerName(c, personFirst);
  /** What a person is called: required name for garages, company otherwise. */
  const primary = (f: ClientForm) => (personFirst ? f.name : f.company).trim();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { page, setPage, reset } = usePagination();

  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [editForm, setEditForm] = useState<ClientForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<ClientRow | null>(null);

  const fetchClients = async (currentPage: number, currentFilter: string, currentSearch: string) => {
    setIsLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    const ids = (roles || []).map((r) => r.user_id);
    if (ids.length === 0) {
      setClients([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }
    let query = (supabase.from("profiles") as any)
      .select("id, full_name, phone, created_at, is_active, company_name, contact_person, address", { count: "exact" })
      .in("id", ids)
      .order("company_name", { ascending: true, nullsFirst: false });
    if (currentFilter === "active") query = query.eq("is_active", true);
    if (currentFilter === "inactive") query = query.eq("is_active", false);
    const term = currentSearch.trim().replace(/[%,()]/g, " ");
    if (term) {
      query = query.or(
        `company_name.ilike.%${term}%,contact_person.ilike.%${term}%,full_name.ilike.%${term}%,phone.ilike.%${term}%`,
      );
    }
    const { data, count, error } = await query.range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) toast.error("Couldn't load clients. Reload the page to try again.");
    setTotalCount(count ?? 0);
    setClients(
      ((data || []) as any[]).map((p) => ({
        user_id: p.id,
        full_name: p.full_name,
        company_name: p.company_name || null,
        contact_person: p.contact_person || null,
        phone: p.phone,
        address: p.address || null,
        created_at: p.created_at,
        is_active: p.is_active ?? true,
      })),
    );
    setIsLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      reset();
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchClients(page, filter, debouncedSearch);
  }, [page, filter, debouncedSearch]);

  const refresh = () => fetchClients(page, filter, debouncedSearch);

  const toggleActive = async (c: ClientRow) => {
    const active = !c.is_active;
    const { error } = await supabase.from("profiles").update({ is_active: active } as any).eq("id", c.user_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setClients((prev) => prev.map((x) => (x.user_id === c.user_id ? { ...x, is_active: active } : x)));
    toast.success(active ? `Portal turned on for ${displayName(c)}` : `Portal turned off for ${displayName(c)}`);
  };

  const sendInvite = async (c: ClientRow) => {
    const { data, error } = await supabase.functions.invoke("admin-resend-invite", { body: { user_id: c.user_id } });
    if (error || (data as { error?: string } | null)?.error) {
      toast.error((data as { error?: string } | null)?.error || (await friendlyErrorMessage(error, "Couldn't send the link")));
      return;
    }
    toast.success(`Emailed ${displayName(c)} a link to set their password and sign in`);
  };

  const openEdit = (c: ClientRow) => {
    setEditing(c);
    setEditForm({
      name: c.full_name || "",
      company: personFirst ? c.company_name || "" : c.company_name || c.full_name || "",
      contact: c.contact_person || "",
      email: "",
      phone: c.phone || "",
      address: c.address || "",
    });
  };

  const saveEdit = async () => {
    if (!editing || !primary(editForm)) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: personFirst ? editForm.name.trim() : editForm.company,
        company_name: personFirst ? editForm.company.trim() || null : editForm.company,
        contact_person: personFirst ? null : editForm.contact || null,
        phone: editForm.phone || null,
        address: editForm.address || null,
      } as any)
      .eq("id", editing.user_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved ${primary(editForm)}`);
    setEditing(null);
    refresh();
  };

  const handleDelete = async (c: ClientRow) => {
    setDeleting(null);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: c.user_id } });
    if (error || data?.error) {
      // The function explains why deletion is blocked (e.g. existing jobs or invoices).
      toast.error(data?.error || (await friendlyErrorMessage(error, "Couldn't delete the client")));
      return;
    }
    toast.success(`Deleted ${displayName(c)}`);
    refresh();
  };

  const handleAdd = async () => {
    if (!form.email || !primary(form)) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("create-client", {
      body: {
        email: form.email,
        full_name: primary(form),
        phone: form.phone || undefined,
        company_name: personFirst ? form.company.trim() || undefined : form.company,
        contact_person: personFirst ? undefined : form.contact || undefined,
        address: form.address || undefined,
      },
    });
    setAdding(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Couldn't create the client");
      return;
    }
    // Email them a link to set their password, the same invite the Users page sends.
    const invite = await supabase.functions.invoke("admin-resend-invite", { body: { user_id: data.user_id } });
    if (invite.error || (invite.data as { error?: string } | null)?.error) {
      toast.warning(`${primary(form)} added, but the invite email didn't send. Use "Send sign-in link" on their row to try again.`);
    } else {
      toast.success(`${primary(form)} added and emailed a link to set their password.`);
    }
    setAddOpen(false);
    setForm(EMPTY_FORM);
    setTimeout(refresh, 1500);
  };

  const filters: FilterOption[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Portal on" },
    { value: "inactive", label: "Portal off" },
  ];

  const portalPill = (c: ClientRow) =>
    c.is_active ? <StatusPill tone="success">Portal on</StatusPill> : <StatusPill tone="neutral">Portal off</StatusPill>;

  const columns: Column<ClientRow>[] = [
    { key: "company", header: personFirst ? "Customer" : "Company", cell: displayName },
    { key: "contact", header: personFirst ? "Company" : "Contact", cell: (c) => (personFirst ? (c.company_name && c.company_name !== c.full_name ? c.company_name : "—") : c.contact_person || "—"), hideBelow: "md" },
    { key: "phone", header: "Phone", cell: (c) => c.phone || "—", hideBelow: "md" },
    { key: "address", header: "Address", cell: (c) => <span className="block max-w-xs truncate">{c.address || "—"}</span>, hideBelow: "xl" },
    { key: "portal", header: "Portal", cell: portalPill },
  ];

  const hasQuery = filter !== "all" || debouncedSearch.trim() !== "";

  const fields = (value: ClientForm, onChange: (v: ClientForm) => void, withEmail: boolean) => (
    <div className="space-y-4">
      {personFirst ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Customer name</Label>
            <Input id="client-name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Jo Smith" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-company">Company (optional)</Label>
            <Input id="client-company" value={value.company} onChange={(e) => onChange({ ...value, company: e.target.value })} placeholder="Only if it's a business customer" />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="client-company">Company name</Label>
            <Input id="client-company" value={value.company} onChange={(e) => onChange({ ...value, company: e.target.value })} placeholder="Acme Fabrication Ltd" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-contact">Contact person</Label>
            <Input id="client-contact" value={value.contact} onChange={(e) => onChange({ ...value, contact: e.target.value })} placeholder="Jo Smith" />
          </div>
        </>
      )}
      {withEmail && (
        <div className="space-y-1.5">
          <Label htmlFor="client-email">Email</Label>
          <Input id="client-email" type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} placeholder="orders@acme.co.uk" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="client-phone">Phone</Label>
          <Input id="client-phone" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="client-address">Address</Label>
          <AddressInput id="client-address" value={value.address} onChange={(address) => onChange({ ...value, address })} />
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Clients"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? profile.customer.noun : profile.customer.plural}`}
          actions={
            <Button onClick={() => setAddOpen(true)}>
              <Plus />
              Add client
            </Button>
          }
        />

        <ListControls
          filters={filters}
          filter={filter}
          onFilterChange={(v) => {
            setFilter(v);
            reset();
          }}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={personFirst ? "Search name, company or phone" : "Search company, contact or phone"}
        />

        <DataList
          rows={clients}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(c) => c.user_id}
          getRowHref={(c) => `/admin/users/${c.user_id}`}
          mobile={{
            title: displayName,
            trailing: portalPill,
            meta: (c) => [c.contact_person, c.phone].filter(Boolean).join(" · "),
          }}
          actions={(c) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${displayName(c)}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem className="min-h-[40px]" onClick={() => openEdit(c)}>
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-[40px]" onClick={() => void sendInvite(c)}>
                  Send sign-in link
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-[40px]" onClick={() => toggleActive(c)}>
                  {c.is_active ? "Turn portal off" : "Turn portal on"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-[40px] text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
                  Delete client
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          empty={
            hasQuery ? (
              <EmptyState title="No clients match" description="Try another filter or search." />
            ) : (
              <EmptyState
                title="No clients yet"
                description={`Add a ${profile.customer.noun} to give them a portal for quotes, orders and invoices.`}
                action={
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus />
                    Add client
                  </Button>
                }
              />
            )
          }
        />

        <ListPagination page={page} pageSize={PAGE_SIZE} total={totalCount} onPageChange={setPage} noun="clients" />
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a client</DialogTitle>
            <DialogDescription>We'll email them a link to set their password and sign in to their portal.</DialogDescription>
          </DialogHeader>
          {fields(form, setForm, true)}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding || !form.email || !primary(form)}>
              {adding ? "Adding…" : "Add client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editing ? displayName(editing) : "client"}</DialogTitle>
          </DialogHeader>
          {fields(editForm, setEditForm, false)}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={!primary(editForm)}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting ? displayName(deleting) : "this client"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account is removed permanently. If they have jobs or invoices, turning their portal off is safer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep client</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && handleDelete(deleting)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
