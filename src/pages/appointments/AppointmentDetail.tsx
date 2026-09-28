import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  ArrowLeft, CalendarDays, Clock, User, Tag, Timer, FileText,
  Briefcase,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline", confirmed: "secondary", in_progress: "default", completed: "default", cancelled: "destructive",
};

const APPT_STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled"];

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [appt, setAppt] = useState<any>(null);
  const [clientName, setClientName] = useState("—");
  const [loading, setLoading] = useState(true);

  // Notes edit
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Create job dialog

  const canManage = role === "admin" || role === "manager";

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const { data: apptData } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!apptData) {
        toast.error("Appointment not found");
        navigate(-1);
        return;
      }

      // Clients can only see their own appointments
      if (role === "client" && apptData.client_id !== user?.id) {
        navigate("/client/appointments");
        return;
      }

      setAppt(apptData);
      setNotes(apptData.notes || "");

      if (apptData.client_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", apptData.client_id)
          .maybeSingle();
        setClientName(profile?.full_name || "Unknown");
      }

      setLoading(false);
    };


    load();
  }, [id, role, user?.id]);

  const handleStatusChange = async (status: string) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", appt.id);
    if (error) { toast.error(error.message); return; }
    setAppt((prev: any) => ({ ...prev, status }));
    toast.success("Status updated");
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase.from("appointments").update({ notes }).eq("id", appt.id);
    if (error) { toast.error(error.message); setSavingNotes(false); return; }
    setAppt((prev: any) => ({ ...prev, notes }));
    toast.success("Notes saved");
    setSavingNotes(false);
  };

  // Projects start at Reception; an appointment that already became one opens it.
  const handleOpenCreateJob = () => navigate(appt.job_id ? `/projects/${appt.job_id}` : `/reception?appointment=${appt.id}`);

  const backPath = role === "client"
    ? "/client/appointments"
    : role === "manager"
      ? "/manager/appointments"
      : "/admin/appointments";

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-2xl" aria-busy="true">
          <h1 className="sr-only">Loading appointment…</h1>
          <Skeleton className="h-8 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to Appointments
        </Button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{appt.title}</h1>
            <p className="text-sm text-muted-foreground capitalize">{appt.type} appointment</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canManage ? (
              <Select value={appt.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue>
                    <Badge variant={statusColors[appt.status] || "outline"}>
                      {appt.status?.replace("_", " ")}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {APPT_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={statusColors[appt.status] || "outline"} className="capitalize">
                {appt.status?.replace("_", " ")}
              </Badge>
            )}
            {canManage && (
              <Button size="sm" onClick={handleOpenCreateJob}>
                <Briefcase className="mr-2 h-4 w-4" />{appt.job_id ? "Open its project" : "Log as a project"}
              </Button>
            )}
          </div>
        </div>

        {/* Details card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="text-sm font-medium">{clientName}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Tag className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-medium capitalize">{appt.type}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium">{appt.appointment_date}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Time</p>
                  <p className="text-sm font-medium">
                    {appt.appointment_time?.slice(0, 5)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Timer className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                  <p className="text-sm font-medium">{appt.duration_minutes || 60} minutes</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">
                    {appt.created_at ? new Date(appt.created_at).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canManage ? (
              <>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this appointment…"
                  rows={4}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveNotes}
                  disabled={savingNotes || notes === (appt.notes || "")}
                >
                  {savingNotes ? "Saving…" : "Save Notes"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {appt.notes || "No notes added."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

    </DashboardLayout>
  );
}
