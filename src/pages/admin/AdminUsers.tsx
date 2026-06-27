import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, Search, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type UserRow = {
  user_id: string;
  full_name: string | null;
  role: string;
  created_at: string;
  is_active: boolean;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const navigate = useNavigate();

  const fetchUsers = async () => {
    setIsLoading(true);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("role", ["admin", "manager", "staff"]).limit(500),
      supabase.from("profiles").select("id, full_name, created_at, is_super_admin, is_active").limit(500),
    ]);
    if (roles && profiles) {
      const merged = roles
        .map((r) => {
          const p = profiles.find((p) => p.id === r.user_id);
          return {
            user_id: r.user_id,
            full_name: p?.full_name || "Unknown",
            role: r.role,
            created_at: p?.created_at || "",
            is_super_admin: !!(p as any)?.is_super_admin,
            is_active: (p as any)?.is_active !== false,
          };
        })
        .filter((u) => !u.is_super_admin);
      setUsers(merged);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = !search || (u.full_name || "").toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const handleDelete = async (userId: string, name: string) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: userId },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to delete user");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    toast.success(`${name} deleted`);
  };

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from("user_roles").update({ role: newRole } as any).eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));
    toast.success("Role updated");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Users</h2>
          <p className="text-muted-foreground">Manage all users and roles</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Filter by role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop table */}
        <Card className="hidden sm:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-[110px] rounded-md" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-7 w-7 rounded" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                ) : filtered.map((u) => (
                  <TableRow key={u.user_id} className="cursor-pointer" onClick={() => navigate(`/admin/users/${u.user_id}`)}>
                    <TableCell className="font-medium">
                      <span className="text-primary hover:underline">{u.full_name}</span>
                      {!u.is_active && <Badge variant="destructive" className="ml-2 text-xs">Inactive</Badge>}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={u.role} onValueChange={(v) => changeRole(u.user_id, v)}>
                        <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/users/${u.user_id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {u.role !== "admin" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Delete user">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {u.full_name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes their account and cannot be undone. If this user has existing jobs or records, deletion will fail — deactivate them instead.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(u.user_id, u.full_name || "User")}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Mobile cards */}
        <div className="sm:hidden space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-8 w-[100px] rounded-md shrink-0" />
                </CardContent>
              </Card>
            ))
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No users found</p>
          ) : filtered.map((u) => (
            <Card key={u.user_id} className="cursor-pointer" onClick={() => navigate(`/admin/users/${u.user_id}`)}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-primary truncate">{u.full_name}</p>
                    {!u.is_active && <Badge variant="destructive" className="text-xs shrink-0">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Select value={u.role} onValueChange={(v) => changeRole(u.user_id, v)}>
                    <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                  {u.role !== "admin" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete user">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {u.full_name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes their account and cannot be undone. If this user has existing jobs or records, deletion will fail — deactivate them instead.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(u.user_id, u.full_name || "User")}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
