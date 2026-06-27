import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline", in_progress: "secondary", review: "default", completed: "default", cancelled: "destructive",
};

export default function StaffJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState("mine");
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = async () => {
    setIsLoading(true);
    if (!user) { setIsLoading(false); return; }
    const { data } = await supabase.from("jobs")
      .select("id, title, status, priority, due_date, assigned_staff_id, client_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setJobs(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    fetchJobs();
  }, [user]);

  const filtered = jobs.filter((j) => {
    if (filter === "mine") return j.assigned_staff_id === user?.id;
    if (filter === "all") return true;
    return j.status === filter;
  });

  const skeletonRows = Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 rounded-full" /></TableCell>
      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
    </TableRow>
  ));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Jobs</h2>
          <p className="text-muted-foreground">View all organisation jobs. You can only update jobs assigned to you.</p>
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="h-auto flex-wrap gap-1">
            <TabsTrigger value="mine">Assigned to Me</TabsTrigger>
            <TabsTrigger value="all">All Jobs</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Priority</TableHead>
                  <TableHead className="hidden sm:table-cell">Due Date</TableHead>
                  <TableHead className="hidden md:table-cell">Assignment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? skeletonRows : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No jobs</TableCell></TableRow>
                ) : filtered.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link to={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
                        {job.title}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant={statusColors[job.status]}>{job.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="capitalize hidden sm:table-cell">{job.priority}</TableCell>
                    <TableCell className="hidden sm:table-cell">{job.due_date || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {job.assigned_staff_id === user?.id
                        ? <Badge variant="secondary">Assigned to me</Badge>
                        : <span className="text-xs text-muted-foreground">Other staff</span>}
                    </TableCell>
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
