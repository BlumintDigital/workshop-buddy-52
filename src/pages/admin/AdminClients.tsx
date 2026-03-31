import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, Pencil, Check, X } from "lucide-react";

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

export default function AdminClients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactPerson, setNewContactPerson] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");

  const fetchClients = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    if (!roles?.length) { setClients([]); return; }
    const ids = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone, created_at, is_active, company_name, contact_person, address" as any).in("id", ids);
    setClients((profiles || []).map((p: any) => ({
      user_id: p.id,
      full_name: p.full_name,
      company_name: p.company_name || null,
      contact_person: p.contact_person || null,
      phone: p.phone,
      address: p.address || null,
      created_at: p.created_at,
      is_active: p.is_active ?? true,
    })));
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const searchStr = [c.company_name, c.contact_person, c.full_name, c.phone].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !search || searchStr.includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? c.is_active : !c.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const toggleActive = async (userId: string, active: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: active } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    setClients((prev) => prev.map((c) => (c.user_id === userId ? { ...c, is_active: active } : c)));
    toast.success(active ? "Client portal activated" : "Client portal deactivated");
  };

  const startEditing = (c: ClientRow) => {
    setEditingId(c.user_id);
    setEditCompanyName(c.company_name || c.full_name || "");
    setEditContactPerson(c.contact_person || "");
    setEditPhone(c.phone || "");
    setEditAddress(c.address || "");
  };

  const cancelEditing = () => { setEditingId(null); };

  const saveEditing = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({
      full_name: editCompanyName,
      company_name: editCompanyName,
      contact_person: editContactPerson || null,
      phone: editPhone || null,
      address: editAddress || null,
    } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    setClients((prev) => prev.map((c) => (c.user_id === userId ? {
      ...c, full_name: editCompanyName, company_name: editCompanyName, contact_person: editContactPerson || null, phone: editPhone || null, address: editAddress || null,
    } : c)));
    setEditingId(null);
    toast.success("Client updated");
  };

  const handleAddClient = async () => {
    if (!newEmail || !newCompanyName) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("create-client", {
      body: {
        email: newEmail,
        full_name: newCompanyName,
        phone: newPhone || undefined,
        company_name: newCompanyName,
        contact_person: newContactPerson || undefined,
        address: newAddress || undefined,
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to create client");
      setAdding(false);
      return;
    }
    toast.success(`Client "${newCompanyName}" created. They can use "Forgot Password" to set their password.`);
    setAddOpen(false);
    setNewCompanyName(""); setNewContactPerson(""); setNewEmail(""); setNewPhone(""); setNewAddress("");
    setAdding(false);
    setTimeout(fetchClients, 1500);
  };

  const displayName = (c: ClientRow) => c.company_name || c.full_name || "—";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Clients</h2>
            <p className="text-muted-foreground">Manage client companies and portal access</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add Client</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Client Company</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Company Name *</Label><Input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Acme Industries" /></div>
                <div><Label>Contact Person</Label><Input value={newContactPerson} onChange={(e) => setNewContactPerson(e.target.value)} placeholder="John Smith" /></div>
                <div><Label>Email *</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="info@acme.com" /></div>
                <div><Label>Phone</Label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+1 555 0123" /></div>
                <div><Label>Address</Label><Input value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="123 Main St, City, State" /></div>
                <p className="text-xs text-muted-foreground">The client will receive a confirmation email and can set their password via "Forgot Password".</p>
                <Button onClick={handleAddClient} className="w-full" disabled={adding || !newEmail || !newCompanyName}>
                  {adding ? "Creating…" : "Create Client"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by company, contact or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop Table */}
        <Card className="hidden sm:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No clients found</TableCell></TableRow>
                ) : filtered.map((c) => {
                  const isEditing = editingId === c.user_id;
                  return (
                    <TableRow key={c.user_id} className={isEditing ? "" : "cursor-pointer"} onClick={() => !isEditing && navigate(`/admin/users/${c.user_id}`)}>
                      <TableCell onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? <Input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} className="h-8" autoFocus /> : <span className="font-medium text-primary hover:underline">{displayName(c)}</span>}
                      </TableCell>
                      <TableCell onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? <Input value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} className="h-8" placeholder="Contact" /> : c.contact_person || "—"}
                      </TableCell>
                      <TableCell onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-8" placeholder="Phone" /> : c.phone || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell" onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} className="h-8" placeholder="Address" /> : c.address || "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c.user_id, v)} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveEditing(c.user_id)}><Check className="h-4 w-4 text-primary" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEditing}><X className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(c)}><Pencil className="h-4 w-4" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Mobile Cards */}
        <div className="sm:hidden space-y-3">
          {filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No clients found</p>
          ) : filtered.map((c) => (
            <Card key={c.user_id} className="cursor-pointer" onClick={() => navigate(`/admin/users/${c.user_id}`)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-primary">{displayName(c)}</span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c.user_id, v)} />
                  </div>
                </div>
                {c.contact_person && <p className="text-sm text-muted-foreground">Contact: {c.contact_person}</p>}
                {c.phone && <p className="text-sm text-muted-foreground">Phone: {c.phone}</p>}
                {c.address && <p className="text-sm text-muted-foreground truncate">Address: {c.address}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
