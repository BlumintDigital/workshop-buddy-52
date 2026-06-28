import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Copy, Plus, Trash2, RefreshCw, KeyRound } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";

type SignupCode = {
  id: string;
  code: string;
  label: string | null;
  role: AppRole;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
};

function generateCode(length = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export default function AdminSignupCodes() {
  const [codes, setCodes] = useState<SignupCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [newCode, setNewCode] = useState(generateCode());
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("client");
  const [newMaxUses, setNewMaxUses] = useState<string>("");
  const [newExpiresDate, setNewExpiresDate] = useState<string>("");
  const [newExpiresTime, setNewExpiresTime] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("signup_codes")
      .select("id, code, label, role, max_uses, uses_count, expires_at, active, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setCodes((data ?? []) as SignupCode[]);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setNewCode(generateCode());
    setNewLabel("");
    setNewRole("client");
    setNewMaxUses("");
    setNewExpiresDate("");
    setNewExpiresTime("");
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!newCode.trim() || newCode.trim().length < 4) {
      toast.error("Code must be at least 4 characters");
      return;
    }
    const maxUsesNum = newMaxUses.trim() === "" ? null : Number(newMaxUses);
    if (maxUsesNum !== null && (!Number.isInteger(maxUsesNum) || maxUsesNum <= 0)) {
      toast.error("Max uses must be a positive whole number, or blank for unlimited");
      return;
    }
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("signup_codes").insert({
      code: newCode.trim(),
      label: newLabel.trim() || null,
      role: newRole,
      max_uses: maxUsesNum,
      expires_at: newExpiresDate ? new Date(`${newExpiresDate}T${newExpiresTime || "23:59"}`).toISOString() : null,
      active: true,
      created_by: user?.id ?? null,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message.includes("unique") ? "That code already exists" : error.message);
      return;
    }
    toast.success("Invite code created");
    setDialogOpen(false);
    void load();
  };

  const toggleActive = async (row: SignupCode, active: boolean) => {
    const { error } = await supabase.from("signup_codes").update({ active }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
    } else {
      setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, active } : c)));
    }
  };

  const handleDelete = async (row: SignupCode) => {
    const { error } = await supabase.from("signup_codes").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
    } else {
      setCodes((prev) => prev.filter((c) => c.id !== row.id));
      toast.success("Code deleted");
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const roleBadge = (role: AppRole) => {
    const config: Record<string, { label: string; className: string }> = {
      client:  { label: "Client",  className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800" },
      staff:   { label: "Staff",   className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800" },
      manager: { label: "Manager", className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800" },
      admin:   { label: "Admin",   className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800" },
    };
    const c = config[role] ?? { label: role, className: "" };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const statusBadge = (row: SignupCode) => {
    const expired = row.expires_at && new Date(row.expires_at) < new Date();
    const exhausted = row.max_uses !== null && row.uses_count >= row.max_uses;
    if (!row.active) return <Badge variant="secondary">Disabled</Badge>;
    if (expired) return <Badge variant="destructive">Expired</Badge>;
    if (exhausted) return <Badge variant="destructive">Used up</Badge>;
    return <Badge>Active</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="min-w-0 max-w-full space-y-6">
        <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Signup Invite Codes</h1>
          <p className="text-muted-foreground">
            Issue codes that visitors must enter to create an account. Disable or delete any code to revoke access.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="flex-1 sm:flex-none">
                <Plus className="mr-2 h-4 w-4" /> New code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create invite code</DialogTitle>
                <DialogDescription>
                  Share this code with the people you want to allow to register.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="code"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                      className="font-mono"
                      maxLength={64}
                    />
                    <Button type="button" variant="outline" onClick={() => setNewCode(generateCode())} className="shrink-0">
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label (optional)</Label>
                  <Input
                    id="label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Acme Inc. – November intake"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="max-uses">Max uses</Label>
                    <Input
                      id="max-uses"
                      type="number"
                      min={1}
                      value={newMaxUses}
                      onChange={(e) => setNewMaxUses(e.target.value)}
                      placeholder="Unlimited"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry date</Label>
                    <DatePickerInput value={newExpiresDate} onChange={setNewExpiresDate} placeholder="No expiry" />
                  </div>
                </div>
                {newExpiresDate && (
                  <div className="space-y-2">
                    <Label htmlFor="expires-time">Expiry time <span className="text-xs text-muted-foreground">(defaults to end of day)</span></Label>
                    <Input
                      id="expires-time"
                      type="time"
                      value={newExpiresTime}
                      onChange={(e) => setNewExpiresTime(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create code"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="min-w-0 max-w-full overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Active and recent codes
          </CardTitle>
          <CardDescription>
            New accounts can only be created with a valid, active, non-expired invite code that still has uses remaining.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  </TableRow>
                )) : codes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No invite codes yet. Create one to allow new sign-ups.
                    </TableCell>
                  </TableRow>
                ) : codes.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[180px] truncate font-mono">{row.code}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{row.label ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {roleBadge(row.role)}
                      </TableCell>
                      <TableCell>
                        {row.uses_count}
                        {row.max_uses !== null ? ` / ${row.max_uses}` : " / ∞"}
                      </TableCell>
                      <TableCell>
                        {row.expires_at
                          ? new Date(row.expires_at).toLocaleString()
                          : <span className="text-muted-foreground">Never</span>}
                      </TableCell>
                      <TableCell>{statusBadge(row)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Switch
                            checked={row.active}
                            onCheckedChange={(v) => toggleActive(row, v)}
                            aria-label="Toggle active"
                          />
                          <Button variant="ghost" size="icon" onClick={() => copyCode(row.code)} aria-label="Copy code">
                            <Copy className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Delete code">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this invite code?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Anyone holding this code will no longer be able to use it. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(row)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}
