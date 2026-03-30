import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline", in_progress: "secondary", review: "default", completed: "default", cancelled: "destructive",
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [updates, setUpdates] = useState<any[]>([]);
  const [staffName, setStaffName] = useState("—");
  const [clientName, setClientName] = useState("—");
  const canEdit = role === "admin" || role === "manager";

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const { data } = await supabase.from("jobs").select("*").eq("id", id).single();
      if (!data) return;
      setJob(data);

      const ids = [data.assigned_staff_id, data.client_id].filter(Boolean);
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        profiles?.forEach((p) => {
          if (p.id === data.assigned_staff_id) setStaffName(p.full_name || "—");
          if (p.id === data.client_id) setClientName(p.full_name || "—");
        });
      }

      const { data: upd } = await supabase.from("job_updates").select("*").eq("job_id", id).order("created_at", { ascending: false });
      setUpdates(upd || []);
    };
    fetch();
  }, [id]);

  const handleStatusChange = async (status: string) => {
    if (!job) return;
    const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    setJob({ ...job, status });
    toast.success("Status updated");
  };

  const handlePriorityChange = async (priority: string) => {
    if (!job) return;
    const { error } = await supabase.from("jobs").update({ priority }).eq("id", job.id);
    if (error) { toast.error(error.message); return; }
    setJob({ ...job, priority });
    toast.success("Priority updated");
  };

  if (!job) return <DashboardLayout><p className="text-muted-foreground p-8">Loading...</p></DashboardLayout>;

  const backPath = role ? `/${role}/jobs` : "/";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate(backPath)}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to Jobs
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{job.title}</h2>
            <p className="text-muted-foreground">{job.description || "No description"}</p>
          </div>
          {canEdit && (
            <Link to={`/invoices/new?jobId=${job.id}`}>
              <Button variant="outline" size="sm">Create Invoice</Button>
            </Link>
          )}
        </div>

        <Card>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              {canEdit ? (
                <Select value={job.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["pending", "in_progress", "review", "completed", "cancelled"].map((s) => (
                      <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={statusColors[job.status]} className="mt-1">{job.status.replace("_", " ")}</Badge>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Priority</Label>
              {canEdit ? (
                <Select value={job.priority} onValueChange={handlePriorityChange}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "medium", "high", "urgent"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="capitalize mt-1 text-sm">{job.priority}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Staff</Label>
              <p className="mt-1 text-sm">{staffName}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Client</Label>
              <p className="mt-1 text-sm">{clientName}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <p className="text-sm">{job.due_date || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">Estimated</Label>
                <p className="text-sm">{job.estimated_hours ? `${job.estimated_hours}h` : "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">Actual</Label>
                <p className="text-sm">{job.actual_hours ? `${job.actual_hours}h` : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {updates.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Activity Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {updates.map((u) => (
                <div key={u.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                  <div>
                    {u.status && <Badge variant="outline" className="mr-2">{u.status.replace("_", " ")}</Badge>}
                    {u.notes && <span className="text-muted-foreground">{u.notes}</span>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(u.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
