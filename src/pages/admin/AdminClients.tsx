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

type ClientForm = { company: string; contact: string; email: string; phone: string; address: string };
const EMPTY_FORM: ClientForm = { company: "", contact: "", email: "", phone: "", address: "" };

const displayName = (c: ClientRow) => c.company_name || c.full_name || "Unnamed client";

export default function AdminClients() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const openEdit = (c: ClientRow) => {
    setEditing(c);
    setEditForm({
      company: c.company_name || c.full_name || "",
      contact: c.contact_person || "",
      email: "",
      phone: c.phone || "",
      address: c.address || "",
    });
  };

  const saveEdit = async () => {
    if (!editing || !editForm.company.trim()) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editForm.company,
        company_name: editForm.company,
        contact_person: editForm.contact || null,
        phone: editForm.phone || null,
        address: editForm.address || null,
      } as any)
      .eq("id", editing.user_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Saved ${editForm.company}`);
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
    if (!form.email || !form.company) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("create-client", {
      body: {
        email: form.email,
        full_name: form.company,
        phone: form.phone || undefined,
        company_name: form.company,
        contact_person: form.contact || undefined,
        address: form.address || undefined,
      },
    });
    setAdding(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Couldn't create the client");
      return;
    }
    toast.success(`${form.company} added. They can set a password with "Forgot password" on the sign-in page.`);
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
    { key: "company", header: "Company", cell: displayName },
    { key: "contact", header: "Contact", cell: (c) => c.contact_person || "—", hideBelow: "md" },
    { key: "phone", header: "Phone", cell: (c) => c.phone || "—", hideBelow: "md" },
    { key: "address", header: "Address", cell: (c) => <span className="block max-w-xs truncate">{c.address || "—"}</span>, hideBelow: "xl" },
    { key: "portal", header: "Portal", cell: portalPill },
  ];

  const hasQuery = filter !== "all" || debouncedSearch.trim() !== "";

  const fields = (value: ClientForm, onChange: (v: ClientForm) => void, withEmail: boolean) => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="client-company">Company name</Label>
        <Input id="client-company" value={value.company} onChange={(e) => onChange({ ...value, company: e.target.value })} placeholder="Acme Fabrication Ltd" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="client-contact">Contact person</Label>
        <Input id="client-contact" value={value.contact} onChange={(e) => onChange({ ...value, contact: e.target.value })} placeholder="Jo Smith" />
      </div>
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
          <Input id="client-address" value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Clients"
          subtitle={isLoading ? "Loading…" : `${totalCount} ${totalCount === 1 ? "company" : "companies"}`}
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
          searchPlaceholder="Search company, contact or phone"
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
                description="Add a client company to give them a portal for quotes, orders and invoices."
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
            <DialogDescription>They'll get a confirmation email and can set their password with "Forgot password".</DialogDescription>
          </DialogHeader>
          {fields(form, setForm, true)}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={adding || !form.email || !form.company}>
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
            <Button onClick={saveEdit} disabled={!editForm.company.trim()}>
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
