import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageBar } from "@/components/dashboard/PageBar";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { formatDate, plural } from "@/lib/format";
import { toast } from "sonner";

type StaffRow = {
  user_id: string;
  full_name: string | null;
  role: string;
  created_at: string;
};

export default function ManagerStaff() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

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

  const q = search.trim().toLowerCase();
  const rows = staff
    .filter((s) => filter === "all" || s.role === filter)
    .filter((s) => !q || (s.full_name ?? "").toLowerCase().includes(q))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  const managers = staff.filter((s) => s.role === "manager").length;
  const roleLabel = (role: string) => (role === "manager" ? "Manager" : "Technician");

  const columns: Column<StaffRow>[] = [
    { key: "name", header: "Name", cell: (s) => s.full_name },
    { key: "joined", header: "Joined", cell: (s) => formatDate(s.created_at), hideBelow: "md" },
  ];

  const roleSelect = (s: StaffRow) => (
    <Select value={s.role} onValueChange={(v) => changeRole(s.user_id, v)}>
      <SelectTrigger className="h-10 w-[150px]" aria-label={`Role for ${s.full_name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="manager">Manager</SelectItem>
        <SelectItem value="staff">Technician</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-4">
        <PageBar
          title="Staff"
          subtitle={isLoading ? "Loading…" : `${plural(staff.length - managers, "technician")} · ${plural(managers, "manager")} · change a role or open a profile`}
        />
        <ListControls
          filters={[
            { value: "all", label: "Everyone" },
            { value: "staff", label: "Technicians", count: staff.length - managers },
            { value: "manager", label: "Managers", count: managers },
          ]}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name"
        />
        <DataList
          rows={rows}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(s) => s.user_id}
          getRowHref={(s) => `/manager/staff/${s.user_id}`}
          actions={roleSelect}
          mobile={{
            title: (s) => s.full_name,
            meta: (s) => `${roleLabel(s.role)} · joined ${formatDate(s.created_at)}`,
          }}
          empty={
            q || filter !== "all" ? (
              <EmptyState title="Nobody matches" description="Try another filter or clear the search." />
            ) : (
              <EmptyState title="No staff yet" description="An admin can invite technicians and managers with a sign-up code." />
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
