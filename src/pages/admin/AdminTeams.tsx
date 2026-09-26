import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Star, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { ListControls } from "@/components/list/ListControls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PERMISSIONS, PERMISSION_LABEL, type Permission } from "@/lib/permissions";
import { plural } from "@/lib/format";

type Team = { id: string; name: string; description: string | null };
type Member = { department_id: string; user_id: string; is_lead: boolean };
type Person = { id: string; name: string; role: "staff" | "manager" };

export default function AdminTeams() {
  const { user } = useAuth();
  const { format: fmt, currency } = useCurrency();
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamPerms, setTeamPerms] = useState<{ department_id: string; permission: Permission }[]>([]);
  const [grants, setGrants] = useState<{ user_id: string; permission: Permission }[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("teams");
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const [accessFor, setAccessFor] = useState<Person | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [t, m, tp, g, roles, r] = await Promise.all([
      supabase.from("departments").select("id, name, description").order("name"),
      supabase.from("department_members").select("department_id, user_id, is_lead"),
      supabase.from("department_permissions").select("department_id, permission"),
      supabase.from("user_permissions").select("user_id, permission"),
      supabase.from("user_roles").select("user_id, role").in("role", ["staff", "manager"]),
      supabase.from("labour_rates").select("user_id, hourly_cost"),
    ]);
    const ids = (roles.data ?? []).map((x) => x.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, is_super_admin").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; is_super_admin: boolean }[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setPeople(
      (roles.data ?? [])
        .filter((x) => !byId.get(x.user_id)?.is_super_admin)
        .map((x) => ({ id: x.user_id, name: byId.get(x.user_id)?.full_name || "Unnamed", role: x.role as Person["role"] }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setTeams(t.data ?? []);
    setMembers(m.data ?? []);
    setTeamPerms((tp.data ?? []) as typeof teamPerms);
    setGrants((g.data ?? []) as typeof grants);
    setRates(Object.fromEntries((r.data ?? []).map((x) => [x.user_id, Number(x.hourly_cost)])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const personName = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const teamName = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const permsOfTeam = (id: string) => teamPerms.filter((p) => p.department_id === id).map((p) => p.permission);
  const teamsOf = (userId: string) => members.filter((m) => m.user_id === userId);

  /** Where each of a person's permissions comes from. */
  const accessOf = (p: Person) => {
    const from = new Map<Permission, string[]>();
    for (const m of teamsOf(p.id)) {
      for (const perm of permsOfTeam(m.department_id)) from.set(perm, [...(from.get(perm) ?? []), teamName[m.department_id]]);
    }
    const direct = grants.filter((g) => g.user_id === p.id).map((g) => g.permission);
    return { from, direct };
  };

  const addMember = async (teamId: string, userId: string) => {
    const { error } = await supabase.from("department_members").insert({ department_id: teamId, user_id: userId });
    if (error) return toast.error(error.message);
    toast.success(`${personName[userId]} added to ${teamName[teamId]}`);
    void load();
  };
  const removeMember = async (m: Member) => {
    const { error } = await supabase.from("department_members").delete().eq("department_id", m.department_id).eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success(`${personName[m.user_id]} removed from ${teamName[m.department_id]}`);
    void load();
  };
  const toggleLead = async (m: Member) => {
    const { error } = await supabase.from("department_members").update({ is_lead: !m.is_lead }).eq("department_id", m.department_id).eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success(m.is_lead ? `${personName[m.user_id]} is no longer a team lead` : `${personName[m.user_id]} now leads ${teamName[m.department_id]}`);
    void load();
  };
  const deleteTeam = async (t: Team) => {
    const { error } = await supabase.from("departments").delete().eq("id", t.id);
    setDeleting(null);
    if (error) return toast.error(error.message);
    toast.success(`${t.name} deleted`);
    void load();
  };
  const saveRate = async (userId: string, value: string) => {
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return toast.error("Enter an hourly cost of 0 or more");
    if ((rates[userId] ?? null) === n) return;
    const { error } =
      n === null
        ? await supabase.from("labour_rates").delete().eq("user_id", userId)
        : await supabase.from("labour_rates").upsert({ user_id: userId, hourly_cost: n, updated_by: user?.id, updated_at: new Date().toISOString() });
    if (error) return toast.error(error.message);
    setRates((prev) => {
      const next = { ...prev };
      if (n === null) delete next[userId];
      else next[userId] = n;
      return next;
    });
    toast.success(n === null ? `Hourly cost cleared for ${personName[userId]}` : `Hourly cost for ${personName[userId]} set to ${fmt(n)}`);
  };

  const q = search.trim().toLowerCase();
  const shownPeople = people.filter((p) => !q || p.name.toLowerCase().includes(q));

  const peopleColumns: Column<Person>[] = [
    {
      key: "name",
      header: "Person",
      cell: (p) => (
        <span>
          <span className="block font-medium">{p.name}</span>
          <span className="text-xs text-muted-foreground">{p.role === "manager" ? "Manager" : "Technician"}</span>
        </span>
      ),
    },
    {
      key: "teams",
      header: "Teams",
      cell: (p) => {
        const ts = teamsOf(p.id);
        return ts.length ? (
          <span className="flex flex-wrap gap-1">
            {ts.map((m) => (
              <StatusPill key={m.department_id} tone="neutral">
                {teamName[m.department_id]}
                {m.is_lead && " · lead"}
              </StatusPill>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">No team</span>
        );
      },
      hideBelow: "md",
    },
    {
      key: "access",
      header: "Can do",
      cell: (p) => {
        if (p.role === "manager") return <span className="text-sm text-muted-foreground">Everything (manager)</span>;
        const { from, direct } = accessOf(p);
        const all = [...new Set([...from.keys(), ...direct])];
        return all.length ? (
          <span className="flex flex-wrap gap-1">
            {all.map((perm) => (
              <StatusPill key={perm} tone={direct.includes(perm) ? "info" : "neutral"}>
                {PERMISSION_LABEL[perm]}
              </StatusPill>
            ))}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Workshop tasks only</span>
        );
      },
    },
    {
      key: "rate",
      header: `Hourly cost (${currency})`,
      cell: (p) => <RateInput key={`${p.id}-${rates[p.id] ?? ""}`} value={rates[p.id]} name={p.name} onSave={(v) => void saveRate(p.id, v)} />,
      align: "right",
    },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-6xl space-y-4">
        <PageBar
          title="Teams and access"
          subtitle="Group people into teams, choose what each team can do, and set everyone's hourly cost."
          actions={
            <Button onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              New team
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="teams">Teams {teams.length > 0 && <span className="ml-1.5 tabular-nums text-muted-foreground">{teams.length}</span>}</TabsTrigger>
            <TabsTrigger value="people">People {people.length > 0 && <span className="ml-1.5 tabular-nums text-muted-foreground">{people.length}</span>}</TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : teams.length === 0 ? (
              <div className="rounded-lg border bg-card px-4 py-10 text-center">
                <EmptyState title="No teams yet" description="Create teams such as Fabrication or Machining, then add the people who work in them." action={<Button onClick={() => setEditing("new")}><Plus />New team</Button>} />
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {teams.map((t) => {
                  const perms = permsOfTeam(t.id);
                  const teamMembers = members.filter((m) => m.department_id === t.id).sort((a, b) => Number(b.is_lead) - Number(a.is_lead) || (personName[a.user_id] ?? "").localeCompare(personName[b.user_id] ?? ""));
                  const addable = people.filter((p) => !teamMembers.some((m) => m.user_id === p.id));
                  return (
                    <Card key={t.id}>
                      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                        <div className="min-w-0">
                          <CardTitle className="text-base">{t.name}</CardTitle>
                          {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Actions for ${t.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(t)}>Edit team</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(t)}>
                              Delete team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Can do</p>
                          {perms.length ? (
                            <div className="flex flex-wrap gap-1">
                              {perms.map((p) => (
                                <StatusPill key={p} tone="info">
                                  {PERMISSION_LABEL[p]}
                                </StatusPill>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Workshop tasks assigned to the team</p>
                          )}
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{plural(teamMembers.length, "person", "people")}</p>
                          {teamMembers.length > 0 && (
                            <ul className="divide-y rounded-md border">
                              {teamMembers.map((m) => (
                                <li key={m.user_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                                  <span className="flex min-w-0 items-center gap-2 text-sm">
                                    <span className="truncate">{personName[m.user_id] ?? "Former user"}</span>
                                    {m.is_lead && <StatusPill tone="success">Lead</StatusPill>}
                                  </span>
                                  <span className="flex shrink-0 gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9"
                                      aria-label={m.is_lead ? `Remove ${personName[m.user_id]} as lead` : `Make ${personName[m.user_id]} team lead`}
                                      title={m.is_lead ? "Remove as lead" : "Make team lead"}
                                      onClick={() => void toggleLead(m)}
                                    >
                                      <Star className={m.is_lead ? "h-4 w-4 fill-current text-warning" : "h-4 w-4"} />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-9 w-9 text-destructive hover:text-destructive"
                                      aria-label={`Remove ${personName[m.user_id]} from ${t.name}`}
                                      onClick={() => void removeMember(m)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {addable.length > 0 && (
                            <Select value="" onValueChange={(v) => void addMember(t.id, v)}>
                              <SelectTrigger className="mt-2 h-10" aria-label={`Add a person to ${t.name}`}>
                                <span className="flex items-center gap-2 text-muted-foreground">
                                  <UserPlus className="h-4 w-4" aria-hidden />
                                  Add a person
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                {addable.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="people" className="mt-4 space-y-4">
            <ListControls search={search} onSearchChange={setSearch} searchPlaceholder="Search by name" />
            <DataList
              rows={shownPeople}
              columns={peopleColumns}
              isLoading={loading}
              getRowKey={(p) => p.id}
              actions={(p) =>
                p.role === "staff" ? (
                  <Button variant="outline" size="sm" className="min-h-[40px]" onClick={() => setAccessFor(p)}>
                    Edit access<span className="sr-only"> for {p.name}</span>
                  </Button>
                ) : null
              }
              mobile={{
                title: (p) => p.name,
                trailing: (p) => (rates[p.id] != null ? <span className="text-sm tabular-nums">{fmt(rates[p.id])}/h</span> : null),
                meta: (p) =>
                  [p.role === "manager" ? "Manager" : "Technician", teamsOf(p.id).map((m) => teamName[m.department_id]).join(", ")].filter(Boolean).join(" · "),
              }}
              empty={<EmptyState title="No staff yet" description="Invite technicians and managers from Users, then add them to teams here." />}
            />
            <p className="text-xs text-muted-foreground">Hourly costs are private. Only admins and people with Reports and costs can see them.</p>
          </TabsContent>
        </Tabs>
      </div>

      {editing && (
        <TeamDialog
          team={editing === "new" ? null : editing}
          permissions={editing === "new" ? [] : permsOfTeam(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {accessFor && (
        <AccessDialog
          person={accessFor}
          inherited={accessOf(accessFor).from}
          direct={accessOf(accessFor).direct}
          onClose={() => setAccessFor(null)}
          onSaved={() => {
            setAccessFor(null);
            void load();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its members lose the team's permissions, and tasks assigned to the team become unassigned. People and tasks are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep team</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleting && void deleteTeam(deleting)}>
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function RateInput({ value, name, onSave }: { value?: number; name: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value != null ? String(value) : "");
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step={0.5}
      value={text}
      placeholder="Not set"
      aria-label={`Hourly cost for ${name}`}
      className="ml-auto h-10 w-28 text-right tabular-nums"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onSave(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function PermissionChecklist({
  value,
  onChange,
  locked,
}: {
  value: Permission[];
  onChange: (v: Permission[]) => void;
  locked?: Map<Permission, string[]>;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Can do</legend>
      {PERMISSIONS.map((p) => {
        const from = locked?.get(p.key);
        const checked = value.includes(p.key) || !!from;
        return (
          <label key={p.key} htmlFor={`perm-${p.key}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:disabled]:cursor-default">
            <Checkbox
              id={`perm-${p.key}`}
              checked={checked}
              disabled={!!from}
              onCheckedChange={(c) => onChange(c ? [...value, p.key] : value.filter((v) => v !== p.key))}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{from ? `From ${from.join(", ")}` : p.description}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function TeamDialog({ team, permissions, onClose, onSaved }: { team: Team | null; permissions: Permission[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [perms, setPerms] = useState<Permission[]>(permissions);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (name.trim().length < 2) return toast.error("Give the team a name");
    setSaving(true);
    let id = team?.id;
    if (team) {
      const { error } = await supabase.from("departments").update({ name: name.trim(), description: description.trim() || null }).eq("id", team.id);
      if (error) {
        setSaving(false);
        return toast.error(error.code === "23505" ? "A team with that name already exists" : error.message);
      }
    } else {
      const { data, error } = await supabase.from("departments").insert({ name: name.trim(), description: description.trim() || null }).select("id").single();
      if (error || !data) {
        setSaving(false);
        return toast.error(error?.code === "23505" ? "A team with that name already exists" : error?.message ?? "Couldn't create the team");
      }
      id = data.id;
    }
    const toAdd = perms.filter((p) => !permissions.includes(p));
    const toRemove = permissions.filter((p) => !perms.includes(p));
    if (toAdd.length) await supabase.from("department_permissions").insert(toAdd.map((permission) => ({ department_id: id!, permission })));
    if (toRemove.length) await supabase.from("department_permissions").delete().eq("department_id", id!).in("permission", toRemove);
    setSaving(false);
    toast.success(team ? `${name.trim()} saved` : `${name.trim()} created`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{team ? `Edit ${team.name}` : "New team"}</DialogTitle>
          <DialogDescription>Everyone in the team gets what you tick here. Leave everything unticked for a workshop team that only does assigned tasks.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="f-team-name">Name</Label>
            <Input id="f-team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fabrication" maxLength={60} />
          </div>
          <div>
            <Label htmlFor="f-team-description">Description (optional)</Label>
            <Textarea id="f-team-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
          </div>
          <PermissionChecklist value={perms} onChange={setPerms} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : team ? "Save team" : "Create team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({
  person,
  inherited,
  direct,
  onClose,
  onSaved,
}: {
  person: Person;
  inherited: Map<Permission, string[]>;
  direct: Permission[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [perms, setPerms] = useState<Permission[]>(direct);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const toAdd = perms.filter((p) => !direct.includes(p) && !inherited.has(p));
    const toRemove = direct.filter((p) => !perms.includes(p));
    if (toAdd.length) {
      const { error } = await supabase.from("user_permissions").insert(toAdd.map((permission) => ({ user_id: person.id, permission, granted_by: user?.id })));
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
    }
    if (toRemove.length) await supabase.from("user_permissions").delete().eq("user_id", person.id).in("permission", toRemove);
    setSaving(false);
    toast.success(`Access updated for ${person.name}`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Access for {person.name}</DialogTitle>
          <DialogDescription>Ticked and greyed out means they already get it from a team. Tick more to give just this person extra access.</DialogDescription>
        </DialogHeader>
        <PermissionChecklist value={perms} onChange={setPerms} locked={inherited} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
