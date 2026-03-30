import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Briefcase, Calendar } from "lucide-react";

export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [role, setRole] = useState<string>("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    // Fetch profile + role
    Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]).then(([pRes, rRes]) => {
      setProfile(pRes.data);
      setRole(rRes.data?.role || "");
    });

    // Jobs: assigned or owned
    supabase
      .from("jobs")
      .select("id, title, status, priority, due_date")
      .or(`assigned_staff_id.eq.${userId},client_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setJobs(data || []));

    // Appointments
    supabase
      .from("appointments")
      .select("id, title, appointment_date, appointment_time, status, type")
      .eq("client_id", userId)
      .order("appointment_date", { ascending: false })
      .limit(50)
      .then(({ data }) => setAppointments(data || []));
  }, [userId]);

  const statusColor: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "outline",
    in_progress: "secondary",
    completed: "default",
    cancelled: "destructive",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>

        <div>
          <h2 className="text-3xl font-bold tracking-tight">{profile?.full_name || "User"}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="capitalize">{role}</Badge>
            {profile?.phone && <span className="text-sm text-muted-foreground">{profile.phone}</span>}
            {profile?.is_active === false && <Badge variant="destructive">Inactive</Badge>}
          </div>
        </div>

        {/* Assigned Jobs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><Briefcase className="h-5 w-5" />Assigned Jobs</CardTitle>
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
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No jobs</TableCell></TableRow>
                ) : jobs.map((j) => (
                  <TableRow key={j.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/jobs/${j.id}`)}>
                    <TableCell className="font-medium">{j.title}</TableCell>
                    <TableCell><Badge variant={statusColor[j.status] || "outline"}>{j.status}</Badge></TableCell>
                    <TableCell className="capitalize">{j.priority}</TableCell>
                    <TableCell>{j.due_date || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Appointments / Availability */}
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
