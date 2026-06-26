import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type StaffRow = {
  user_id: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

export default function ManagerStaff() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const fetchStaff = async () => {
    setIsLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["staff", "manager"]);
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, created_at, is_super_admin");
    if (roles && profiles) {
      const merged = roles
        .map((r) => {
          const p = profiles.find((p) => p.id === r.user_id);
          return { user_id: r.user_id, full_name: p?.full_name || "Unknown", role: r.role, created_at: p?.created_at || "" };
        })
        .filter((u) => {
          const p = profiles.find((p) => p.id === u.user_id);
          return !(p as any)?.is_super_admin;
        });
      setStaff(merged);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchStaff(); }, []);

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole } as any).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    setStaff((prev) => prev.map((s) => (s.user_id === userId ? { ...s, role: newRole } : s)));
    toast.success("Role updated");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Staff</h2>
          <p className="text-muted-foreground">Manage staff and manager accounts</p>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[80px]">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                )) : staff.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No staff members</TableCell></TableRow>
                ) : staff.map((s) => (
                  <TableRow key={s.user_id}>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell>
                      <Select value={s.role} onValueChange={(v) => changeRole(s.user_id, v)}>
                        <SelectTrigger className="w-[130px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => navigate(`/manager/staff/${s.user_id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
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
