import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, AlertTriangle, Download, UserX, UserCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csv";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

type ReviewUser = {
  user_id: string;
  full_name: string | null;
  email?: string;
  role: string;
  is_active: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

const STALE_DAYS = 90;

function isStale(lastSignIn: string | null): boolean {
  if (!lastSignIn) return true;
  const daysSince = (Date.now() - new Date(lastSignIn).getTime()) / 86_400_000;
  return daysSince > STALE_DAYS;
}

export default function AdminAccessReview() {
  const [users, setUsers] = useState<ReviewUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, created_at, is_active, is_super_admin");
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (!profiles) { setLoading(false); return; }

    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));

    // Auth metadata (last_sign_in_at) requires a server-side global admin call,
    // which is not available from the browser. Skip — fields stay null and the UI handles that.
    const authMap = new Map<string, { last_sign_in_at: string | null; email?: string }>();


    const merged: ReviewUser[] = profiles
      .filter((p) => !(p as any).is_super_admin)
      .map((p) => ({
        user_id: p.id,
        full_name: p.full_name,
        email: authMap.get(p.id)?.email,
        role: roleMap.get(p.id) ?? "client",
        is_active: (p as any).is_active !== false,
        last_sign_in_at: authMap.get(p.id)?.last_sign_in_at ?? null,
        created_at: p.created_at ?? "",
      }));

    // Sort: stale inactive first, then stale active, then healthy
    merged.sort((a, b) => {
      const aStale = isStale(a.last_sign_in_at) ? 1 : 0;
      const bStale = isStale(b.last_sign_in_at) ? 1 : 0;
      return bStale - aStale;
    });

    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleActive = async (u: ReviewUser) => {
    setActionLoading(u.user_id + "-toggle");
    const newState = !u.is_active;
    const { error } = await supabase.functions.invoke("admin-toggle-user", {
      body: { user_id: u.user_id, is_active: newState },
    });
    setActionLoading(null);
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((x) => x.user_id === u.user_id ? { ...x, is_active: newState } : x));
    toast.success(`${u.full_name ?? "User"} ${newState ? "activated" : "deactivated"}`);
  };

  const removeRole = async (u: ReviewUser) => {
    setActionLoading(u.user_id + "-role");
    const { error } = await supabase.from("user_roles").delete().eq("user_id", u.user_id);
    setActionLoading(null);
    if (error) { toast.error(error.message); return; }
    setUsers((prev) => prev.map((x) => x.user_id === u.user_id ? { ...x, role: "" } : x));
    toast.success(`Role removed for ${u.full_name ?? "user"}`);
  };

  const handleExport = () => {
    const headers = ["Name", "Role", "Status", "Last Sign-In", "Account Created", "Stale (>90d)"];
    const rows = users.map((u) => [
      u.full_name ?? "",
      u.role,
      u.is_active ? "Active" : "Inactive",
      u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : "Never",
      new Date(u.created_at).toISOString(),
      isStale(u.last_sign_in_at) ? "Yes" : "No",
    ]);
    downloadCSV(`access-review-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const staleCount = users.filter((u) => isStale(u.last_sign_in_at)).length;

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7" />
              Access Review
            </h2>
            <p className="text-muted-foreground">Quarterly audit of user accounts and privileges</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="w-full shrink-0 gap-2 sm:w-auto">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-sm text-muted-foreground">Total users</p>
            </CardContent>
          </Card>
          <Card className={staleCount > 0 ? "border-amber-400" : ""}>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-amber-600">{staleCount}</p>
              <p className="text-sm text-muted-foreground">Inactive &gt;{STALE_DAYS} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-destructive">
                {users.filter((u) => !u.is_active).length}
              </p>
              <p className="text-sm text-muted-foreground">Deactivated accounts</p>
            </CardContent>
          </Card>
        </div>

        {staleCount > 0 && (
          <Card className="border-amber-400 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-400">
                  <strong>{staleCount} user{staleCount > 1 ? "s have" : " has"}</strong> not signed in for more than {STALE_DAYS} days.
                  Review and deactivate accounts that are no longer needed.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* User table */}
        <Card className="min-w-0 max-w-full overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All Users</CardTitle>
            <CardDescription>
              Rows highlighted in amber have not signed in for {STALE_DAYS}+ days.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sign-In</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  </TableRow>
                )) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : users.map((u) => {
                  const stale = isStale(u.last_sign_in_at);
                  return (
                    <TableRow key={u.user_id} className={stale ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}>
                      <TableCell className="font-medium">
                        {u.full_name ?? "—"}
                        {!u.is_active && (
                          <Badge variant="destructive" className="ml-2 text-xs">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="capitalize">{u.role || <span className="text-muted-foreground">none</span>}</TableCell>
                      <TableCell>
                        {stale ? (
                          <Badge variant="outline" className="text-amber-600 border-amber-400">
                            Stale
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-400">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.last_sign_in_at
                          ? formatDistanceToNow(new Date(u.last_sign_in_at), { addSuffix: true })
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            disabled={actionLoading === u.user_id + "-toggle"}
                            onClick={() => toggleActive(u)}
                          >
                            {u.is_active
                              ? <><UserX className="h-3.5 w-3.5" />Deactivate</>
                              : <><UserCheck className="h-3.5 w-3.5" />Activate</>}
                          </Button>
                          {u.role && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 h-7 text-xs text-destructive hover:text-destructive"
                              disabled={actionLoading === u.user_id + "-role"}
                              onClick={() => removeRole(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remove role
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-right">
          SOC2 CC6.2 — This review should be completed quarterly and the exported CSV retained for audit evidence.
        </p>
      </div>
    </DashboardLayout>
  );
}
