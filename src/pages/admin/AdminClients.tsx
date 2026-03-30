import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type ClientRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  is_active: boolean;
};

export default function AdminClients() {
  const [clients, setClients] = useState<ClientRow[]>([]);

  const fetchClients = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "client");
    if (!roles?.length) { setClients([]); return; }
    const ids = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone, created_at, is_active").in("id", ids);
    setClients((profiles || []).map((p) => ({ user_id: p.id, full_name: p.full_name, phone: p.phone, created_at: p.created_at, is_active: p.is_active ?? true })));
  };

  useEffect(() => { fetchClients(); }, []);

  const toggleActive = async (userId: string, active: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: active } as any).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    setClients((prev) => prev.map((c) => (c.user_id === userId ? { ...c, is_active: active } : c)));
    toast.success(active ? "Client portal activated" : "Client portal deactivated");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground">Manage client accounts and portal access</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No clients found</TableCell></TableRow>
                ) : clients.map((c) => (
                  <TableRow key={c.user_id}>
                    <TableCell className="font-medium">{c.full_name || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c.user_id, v)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
