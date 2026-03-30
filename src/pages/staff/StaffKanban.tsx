import { useEffect, useState, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, GripVertical } from "lucide-react";

type Job = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  description: string | null;
};

const columns = [
  { key: "pending", label: "Todo", color: "bg-muted" },
  { key: "in_progress", label: "In Progress", color: "bg-secondary" },
  { key: "completed", label: "Done", color: "bg-primary/10" },
] as const;

const priorityVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  urgent: "destructive",
};

export default function StaffKanban() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("jobs")
      .select("id, title, status, priority, due_date, description")
      .eq("assigned_staff_id", user.id)
      .then(({ data }) => setJobs(data || []));
  }, [user]);

  const handleDragStart = (e: DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: DragEvent, newStatus: string) => {
    e.preventDefault();
    if (!draggedId) return;

    const job = jobs.find((j) => j.id === draggedId);
    if (!job || job.status === newStatus) { setDraggedId(null); return; }

    // Optimistic update
    setJobs((prev) => prev.map((j) => (j.id === draggedId ? { ...j, status: newStatus } : j)));
    setDraggedId(null);

    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", draggedId);
    if (error) {
      toast.error("Failed to update status");
      setJobs((prev) => prev.map((j) => (j.id === draggedId ? { ...j, status: job.status } : j)));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Kanban Board</h2>
          <p className="text-muted-foreground">Drag tasks between columns to update status</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-h-[60vh]">
          {columns.map((col) => {
            const colJobs = jobs.filter((j) => j.status === col.key);
            return (
              <div
                key={col.key}
                className="flex flex-col rounded-lg border bg-card"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className={`px-4 py-3 rounded-t-lg ${col.color} border-b`}>
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    {col.label}
                    <Badge variant="outline" className="ml-auto">{colJobs.length}</Badge>
                  </h3>
                </div>
                <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                  {colJobs.map((job) => (
                    <Card
                      key={job.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, job.id)}
                      className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${draggedId === job.id ? "opacity-50" : ""}`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm leading-tight">{job.title}</span>
                        </div>
                        {job.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 pl-6">{job.description}</p>
                        )}
                        <div className="flex items-center gap-2 pl-6">
                          <Badge variant={priorityVariant[job.priority] || "outline"} className="text-xs">
                            {job.priority}
                          </Badge>
                          {job.due_date && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {job.due_date}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {colJobs.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Drop tasks here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
