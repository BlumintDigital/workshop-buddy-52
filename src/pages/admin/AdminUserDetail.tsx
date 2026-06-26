import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatsCards";
import { toast } from "sonner";
import {
  ArrowLeft, Briefcase, Calendar, UserX, UserCheck,
  CheckCircle2, Clock, DollarSign, Timer, Building2, Phone, MapPin, User, Receipt,
} from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  company_name: string | null;
  contact_person: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string;
};

type Job = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  actual_hours: number | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  due_date: string | null;
};

type Appointment = {
  id: string;
  title: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  type: string;
};

const jobStatusColor: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  in_progress: "secondary",
  review: "secondary",
  completed: "default",
  cancelled: "destructive",
};

const invoiceStatusColor: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  paid: "default",
  unpaid: "outline",
  draft: "secondary",
  overdue: "destructive",
};

export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { role: callerRole, user: callerUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setIsLoading(true);

      const [{ data: profileData }, { data: roleData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      ]);

      setProfile(profileData as Profile);
      const resolvedRole = roleData?.role || "";
      setRole(resolvedRole);

      const fetches: Promise<unknown>[] = [
        supabase
          .from("appointments")
          .select("id, title, appointment_date, appointment_time, status, type")
          .eq("client_id", userId)
          .order("appointment_date", { ascending: false })
          .limit(50)
          .then(({ data }) => setAppointments(data || [])),
      ];

      if (resolvedRole === "client") {
        fetches.push(
          supabase
            .from("jobs")
            .select("id, title, status, priority, due_date, actual_hours")
            .eq("client_id", userId)
            .order("created_at", { ascending: false })
            .limit(50)
            .then(({ data }) => setJobs(data || [])),
          supabase
            .from("invoices")
            .select("id, invoice_number, status, total, due_date")
            .eq("client_id", userId)
            .order("created_at", { ascending: false })
            .limit(20)
            .then(({ data }) => setInvoices(data || [])),
        );
      } else if (resolvedRole === "staff" || resolvedRole === "manager") {
        fetches.push(
          supabase
            .from("jobs")
            .select("id, title, status, priority, due_date, actual_hours")
            .eq("assigned_staff_id", userId)
            .order("created_at", { ascending: false })
            .limit(50)
            .then(({ data }) => setJobs(data || [])),
        );
      }

      await Promise.all(fetches);
      setIsLoading(false);
    };

    load();
  }, [userId]);

  const handleToggleActive = async () => {
    if (!userId || !profile) return;
    setToggling(true);
    const newState = !profile.is_active;
    const { error } = await supabase.functions.invoke("admin-toggle-user", {
      body: { user_id: userId, is_active: newState },
    });
    setToggling(false);
    if (error) {
      toast.error(`Failed to ${newState ? "activate" : "deactivate"} user: ${error.message}`);
      return;
    }
    setProfile((p) => (p ? { ...p, is_active: newState } : p));
    toast.success(`User ${newState ? "activated" : "deactivated"}`);
  };

  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const activeJobs = jobs.filter((j) => ["pending", "in_progress", "review"].includes(j.status)).length;
  const totalBilled = invoices.reduce((sum, i) => sum + i.total, 0);
  const unpaidCount = invoices.filter((i) => i.status !== "paid").length;
  const hoursLogged = jobs.reduce((sum, j) => sum + (j.actual_hours ?? 0), 0);

  const isClient = role === "client";
  const isStaffOrManager = role === "staff" || role === "manager";
  const showStats = isClient || isStaffOrManager;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-20" />
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-52" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
            <Skeleton className="h-9 w-28 shrink-0" />
          </div>
          <Skeleton className="h-36 rounded-xl" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />Back
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{profile?.full_name || "User"}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="capitalize">{role}</Badge>
              {profile?.is_active === false && <Badge variant="destructive">Inactive</Badge>}
            </div>
          </div>
          {callerRole === "admin" && profile && !profile.is_super_admin && callerUser?.id !== userId && (
            <Button
              variant={profile.is_active !== false ? "outline" : "default"}
              size="sm"
              onClick={handleToggleActive}
              disabled={toggling}
              className="shrink-0 gap-2"
            >
              {profile.is_active !== false
                ? <><UserX className="h-4 w-4" />{toggling ? "Deactivating..." : "Deactivate"}</>
                : <><UserCheck className="h-4 w-4" />{toggling ? "Activating..." : "Activate"}</>}
            </Button>
          )}
        </div>

        {/* Profile info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><User className="h-5 w-5" />Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {isClient && profile?.company_name && (
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Company</dt>
                    <dd className="text-sm font-medium">{profile.company_name}</dd>
                  </div>
                </div>
              )}
              {isClient && profile?.contact_person && (
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Contact Person</dt>
                    <dd className="text-sm font-medium">{profile.contact_person}</dd>
                  </div>
                </div>
              )}
              {profile?.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd className="text-sm font-medium">{profile.phone}</dd>
                  </div>
                </div>
              )}
              {isClient && profile?.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Address</dt>
                    <dd className="text-sm font-medium">{profile.address}</dd>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <dt className="text-xs text-muted-foreground">Member Since</dt>
                  <dd className="text-sm font-medium">
                    {profile?.created_at
                      ? new Date(profile.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                      : "—"}
                  </dd>
                </div>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Stats row */}
        {showStats && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              title="Total Jobs"
              value={jobs.length}
              icon={Briefcase}
              iconClassName="bg-gradient-to-br from-blue-500 to-blue-700"
            />
            <StatCard
              title="Completed"
              value={completedJobs}
              icon={CheckCircle2}
              iconClassName="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
            {isClient ? (
              <>
                <StatCard
                  title="Active / Pending"
                  value={activeJobs}
                  icon={Clock}
                  iconClassName="bg-gradient-to-br from-amber-500 to-amber-700"
                />
                <StatCard
                  title="Total Billed"
                  value={`£${totalBilled.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  description={unpaidCount > 0 ? `${unpaidCount} unpaid invoice${unpaidCount > 1 ? "s" : ""}` : "All settled"}
                  icon={DollarSign}
                  iconClassName="bg-gradient-to-br from-violet-500 to-violet-700"
                />
              </>
            ) : (
              <>
                <StatCard
                  title="Active"
                  value={activeJobs}
                  icon={Clock}
                  iconClassName="bg-gradient-to-br from-amber-500 to-amber-700"
                />
                <StatCard
                  title="Hours Logged"
                  value={hoursLogged.toFixed(1)}
                  description="actual hours on jobs"
                  icon={Timer}
                  iconClassName="bg-gradient-to-br from-violet-500 to-violet-700"
                />
              </>
            )}
          </div>
        )}

        {/* Jobs */}
        {(isClient || isStaffOrManager) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                {isClient ? "Jobs" : "Assigned Jobs"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No jobs found</TableCell></TableRow>
                  ) : jobs.map((j) => (
                    <TableRow key={j.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/jobs/${j.id}`)}>
                      <TableCell className="font-medium">{j.title}</TableCell>
                      <TableCell>
                        <Badge variant={jobStatusColor[j.status] || "outline"} className="capitalize">
                          {j.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{j.priority}</TableCell>
                      <TableCell>{j.due_date ? new Date(j.due_date).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Invoices — clients only */}
        {isClient && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-5 w-5" />Invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No invoices found</TableCell></TableRow>
                  ) : invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                      <TableCell>
                        <Badge variant={invoiceStatusColor[inv.status] || "outline"} className="capitalize">
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>£{inv.total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Appointments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Calendar className="h-5 w-5" />Appointments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No appointments</TableCell></TableRow>
                ) : appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{a.appointment_date}</TableCell>
                    <TableCell>{a.appointment_time}</TableCell>
                    <TableCell className="capitalize">{a.type}</TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
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
