import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { ListControls, type FilterOption } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { useAuth } from "@/hooks/useAuth";

type UserRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  created_at: string;
  is_active: boolean;
  invited_at: string | null;
  invite_accepted_at: string | null;
  last_sign_in_at: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const { role: callerRole, user: currentUser } = useAuth();

  // Create user dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyForm = { full_name: "", email: "", role: "staff" as string, phone: "" };
  const [form, setForm] = useState(emptyForm);

  const fetchUsers = async () => {
    setIsLoading(true);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").limit(500),
      supabase.from("profiles").select("id, full_name, created_at, is_super_admin, is_active, invited_at, invite_accepted_at, last_sign_in_at").limit(500),
    ]);
    if (profiles) {
      const merged: UserRow[] = profiles
        .filter((p) => !(p as any).is_super_admin)
        .map((p) => {
          const r = (roles ?? []).find((r) => r.user_id === p.id);
          return {
            user_id: p.id,
            full_name: (p as any).full_name || "Unknown",
            role: (r?.role as string | undefined) ?? null,
            created_at: p.created_at || "",
            is_active: (p as any).is_active !== false,
            invited_at: (p as any).invited_at ?? null,
            invite_accepted_at: (p as any).invite_accepted_at ?? null,
            last_sign_in_at: (p as any).last_sign_in_at ?? null,
          };
        });
      setUsers(merged);
    }
    setIsLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = !search || (u.full_name || "").toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || (roleFilter === "none" ? u.role === null : u.role === roleFilter);
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const handleDelete = async (userId: string, name: string) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: userId },
    });
    if (error || data?.error) {
      // The function's explanation (e.g. existing records block deletion)
      // lives in the error body — surface it instead of the generic message.
      toast.error(data?.error || (await friendlyErrorMessage(error, "Failed to delete user")));
      return;
    }
    setUsers((prev) => prev.filter((u) => u.user_id !== userId));
    toast.success(`${name} deleted`);
  };

  const changeRole = async (userId: string, newRole: string) => {
    const { data, error } = await supabase.functions.invoke("admin-set-user-role", {
      body: { user_id: userId, role: newRole },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to update role");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, role: newRole } : u)));
    toast.success("Role updated");
  };

  const handleCreate = async () => {
    const full_name = form.full_name.trim();
    const email = form.email.trim().toLowerCase();
    if (!full_name) { toast.error("Full name is required"); return; }
    if (!EMAIL_RE.test(email)) { toast.error("Enter a valid email"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { full_name, email, role: form.role, phone: form.phone.trim() || undefined },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to create user");
      return;
    }
    toast.success(`${full_name} created. They'll receive an email to set their password.`);
    setForm(emptyForm);
    setCreateOpen(false);
    fetchUsers();
  };

  const [resending, setResending] = useState<Record<string, boolean>>({});
  const handleResend = async (userId: string, name: string) => {
    setResending((p) => ({ ...p, [userId]: true }));
    const { data, error } = await supabase.functions.invoke("admin-resend-invite", {
      body: { user_id: userId },
    });
    setResending((p) => ({ ...p, [userId]: false }));
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to resend invite");
      return;
    }
    toast.success(`Invite resent to ${name}`);
    setUsers((prev) =>
      prev.map((u) => (u.user_id === userId ? { ...u, invited_at: new Date().toISOString() } : u)),
    );
  };

  const inviteStatus = (u: UserRow): "accepted" | "invited" | "unknown" => {
    // A recorded sign-in is proof of acceptance even if invite_accepted_at
    // was missed (older logins were blocked by RLS at aal1).
    if (u.invite_accepted_at || u.last_sign_in_at) return "accepted";
    if (u.invited_at) return "invited";
    return "unknown";
  };

  const canAssignAdmin = callerRole === "admin";

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    const key = u.role ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const filters: FilterOption[] = [
    { value: "all", label: "All", count: users.length },
    { value: "admin", label: "Admins", count: roleCounts.admin },
    { value: "manager", label: "Managers", count: roleCounts.manager },
    { value: "staff", label: "Staff", count: roleCounts.staff },
    { value: "client", label: "Clients", count: roleCounts.client },
    ...(roleCounts.none ? [{ value: "none", label: "No role", count: roleCounts.none }] : []),
  ];

  const accountPill = (u: UserRow) => {
    if (!u.is_active) return <StatusPill tone="danger">Deactivated</StatusPill>;
    const status = inviteStatus(u);
    if (status === "invited") return <StatusPill tone="warning">Invite sent</StatusPill>;
    if (status === "accepted") return <StatusPill tone="success">Active</StatusPill>;
    return <StatusPill tone="neutral">Not invited</StatusPill>;
  };

  const columns: Column<UserRow>[] = [
    { key: "name", header: "Name", cell: (u) => u.full_name || "Unknown" },
    { key: "role", header: "Role", cell: (u) => <span className="capitalize">{u.role ?? "No role"}</span> },
    { key: "status", header: "Account", cell: accountPill },
    { key: "last", header: "Last sign-in", cell: (u) => formatDate(u.last_sign_in_at), hideBelow: "lg" },
    { key: "joined", header: "Added", cell: (u) => formatDate(u.created_at), hideBelow: "md" },
  ];

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-4">
        <PageBar
          title="Users"
          subtitle={isLoading ? "Loading…" : `${users.length} ${users.length === 1 ? "person" : "people"} with access`}
          actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus />New user</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add a user</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Full Name *</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" maxLength={100} />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" maxLength={255} />
                </div>
                <div>
                  <Label>Role *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {canAssignAdmin && <SelectItem value="admin">Admin</SelectItem>}
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0123" maxLength={32} />
                </div>
                <p className="text-xs text-muted-foreground">
                  The user will receive an invite email to set their password.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !form.full_name || !form.email}>
                  {creating ? "Adding…" : "Add user"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          }
        />

        <ListControls
          filters={filters}
          filter={roleFilter}
          onFilterChange={setRoleFilter}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name"
        />

        <DataList
          rows={filtered}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(u) => u.user_id}
          getRowHref={(u) => `/admin/users/${u.user_id}`}
          mobile={{
            title: (u) => u.full_name || "Unknown",
            trailing: accountPill,
            meta: (u) => [u.role ? u.role[0].toUpperCase() + u.role.slice(1) : "No role", u.last_sign_in_at && `Last in ${formatDate(u.last_sign_in_at)}`].filter(Boolean).join(" · "),
          }}
          actions={(u) => {
            const isSelf = u.user_id === currentUser?.id;
            const status = inviteStatus(u);
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Actions for ${u.full_name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    {isSelf ? "You can't change your own role" : "Role"}
                  </DropdownMenuLabel>
                  {!isSelf &&
                    ROLES.filter((r) => r !== "admin" || canAssignAdmin).map((r) => (
                      <DropdownMenuItem key={r} className="min-h-[40px] capitalize" disabled={u.role === r} onClick={() => changeRole(u.user_id, r)}>
                        {u.role === r ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-2 w-4" />}
                        {r}
                      </DropdownMenuItem>
                    ))}
                  {status !== "accepted" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-[40px]" disabled={!!resending[u.user_id]} onClick={() => handleResend(u.user_id, u.full_name || "user")}>
                        Resend invite
                      </DropdownMenuItem>
                    </>
                  )}
                  {!isSelf && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-[40px] text-destructive focus:text-destructive" onClick={() => setDeleting(u)}>
                        Delete user
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }}
          empty={
            search || roleFilter !== "all" ? (
              <EmptyState title="No users match" description="Try another role or search." />
            ) : (
              <EmptyState title="No users yet" description="Add your team and clients so they can sign in." action={<Button onClick={() => setCreateOpen(true)}><Plus />New user</Button>} />
            )
          }
        />
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their account is removed permanently. If they have jobs or other records, deleting will fail. Deactivate them from their profile instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep user</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) handleDelete(deleting.user_id, deleting.full_name || "User");
                setDeleting(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

const ROLES = ["admin", "manager", "staff", "client"] as const;

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}
