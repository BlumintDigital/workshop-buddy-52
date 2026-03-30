import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, Wifi } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  quote: "secondary", pending: "outline", in_progress: "secondary", review: "default", completed: "default", cancelled: "destructive",
};

export default function ClientJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [live, setLive] = useState(false);

  const fetchJobs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setJobs(data || []);
  };

  useEffect(() => {
    if (!user) return;
    fetchJobs();

    const channel = supabase
      .channel("client-jobs-rt")
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "jobs",
        filter: `client_id=eq.${user.id}`,
      }, (payload) => {
        setJobs(prev => prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new } : j));
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "jobs",
        filter: `client_id=eq.${user.id}`,
      }, (payload) => {
        setJobs(prev => [payload.new as any, ...prev]);
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleQuoteAction = async (jobId: string, approve: boolean) => {
    const newStatus = approve ? "pending" : "cancelled";
    const { error } = await supabase.from("jobs").update({ status: newStatus }).eq("id", jobId);
    if (error) { toast.error(error.message); return; }
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
    toast.success(approve ? "Quote approved — work will begin shortly" : "Quote declined");
  };

  const quotes = jobs.filter(j => j.status === "quote");
  const filtered = filter === "all"
    ? jobs.filter(j => j.status !== "quote")
    : jobs.filter(j => j.status === filter);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">My Jobs</h2>
            <p className="text-muted-foreground">Track your workshop jobs</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wifi className={`h-3.5 w-3.5 ${live ? "text-emerald-500" : ""}`} />
            {live ? "Live" : "Connecting..."}
          </div>
        </div>

        {/* Quotes awaiting approval */}
        {quotes.length > 0 && (
          <Card className="border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quotes Pending Your Approval</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quotes.map(q => (
                <div key={q.id} className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Link to={`/jobs/${q.id}`} className="font-medium text-sm hover:underline">{q.title}</Link>
                    {q.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{q.description}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleQuoteAction(q.id, false)}>
                      <XCircle className="mr-1.5 h-3.5 w-3.5 text-destructive" />Decline
                    </Button>
                    <Button size="sm" onClick={() => handleQuoteAction(q.id, true)}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="flex overflow-x-auto flex-nowrap">
            <TabsTrigger value="all">All</TabsTrigger>
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
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No jobs</TableCell></TableRow>
                ) : filtered.map((job) => (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link to={`/jobs/${job.id}`} className="font-medium text-primary hover:underline">
                        {job.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[job.status]}>{job.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="capitalize hidden sm:table-cell">{job.priority}</TableCell>
                    <TableCell className="hidden sm:table-cell">{new Date(job.created_at).toLocaleDateString()}</TableCell>
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
