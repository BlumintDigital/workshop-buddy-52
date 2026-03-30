import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  full_name: string | null;
  phone: string | null;
  created_at: string;
  is_active: boolean;
};

export default function AdminClients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const fetchClients = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    if (!roles?.length) { setClients([]); return; }
    const ids = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone, created_at, is_active").in("id", ids);
    setClients((profiles || []).map((p) => ({ user_id: p.id, full_name: p.full_name, phone: p.phone, created_at: p.created_at, is_active: p.is_active ?? true })));
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch = !search || (c.full_name || "").toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search);
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
    setEditName(c.full_name || "");
    setEditPhone(c.phone || "");
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = async (userId: string) => {
    const { error } = await supabase.from("profiles").update({ full_name: editName, phone: editPhone || null } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    setClients((prev) => prev.map((c) => (c.user_id === userId ? { ...c, full_name: editName, phone: editPhone || null } : c)));
    setEditingId(null);
    toast.success("Client updated");
  };

  const handleAddClient = async () => {
    if (!newEmail || !newName) return;
    setAdding(true);
    const { data, error } = await supabase.functions.invoke("create-client", {
      body: { email: newEmail, full_name: newName, phone: newPhone || undefined },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to create client");
      setAdding(false);
      return;
    }
    toast.success(`Client "${newName}" created. They can use "Forgot Password" to set their password.`);
    setAddOpen(false);
    setNewEmail(""); setNewName(""); setNewPhone("");
    setAdding(false);
    setTimeout(fetchClients, 1500);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
            <p className="text-muted-foreground">Manage client accounts and portal access</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add Client</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Full Name *</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Smith" /></div>
                <div><Label>Email *</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="john@example.com" /></div>
                <div><Label>Phone</Label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+1 555 0123" /></div>
                <p className="text-xs text-muted-foreground">The client will receive a confirmation email and can set their password via "Forgot Password".</p>
                <Button onClick={handleAddClient} className="w-full" disabled={adding || !newEmail || !newName}>
                  {adding ? "Creating…" : "Create Client"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Portal Active</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No clients found</TableCell></TableRow>
                ) : filtered.map((c) => {
                  const isEditing = editingId === c.user_id;
                  return (
                    <TableRow key={c.user_id} className={isEditing ? "" : "cursor-pointer"} onClick={() => !isEditing && navigate(`/admin/users/${c.user_id}`)}>
                      <TableCell onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? (
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus />
                        ) : (
                          <span className="font-medium text-primary hover:underline">{c.full_name || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => isEditing && e.stopPropagation()}>
                        {isEditing ? (
                          <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="h-8" placeholder="Phone" />
                        ) : (
                          c.phone || "—"
                        )}
                      </TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c.user_id, v)} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveEditing(c.user_id)}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEditing}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
