import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, TrendingUp } from "lucide-react";

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  tasks_completed: number;
  total_value: number;
}

export default function GoalsPage() {
  const { user } = useAuth();
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  useEffect(() => {
    const load = async () => {
      // Fetch monthly goal & currency
      const { data: settingsData } = await supabase
        .from("workshop_settings")
        .select("monthly_goal, currency")
        .eq("id", 1)
        .maybeSingle();

      const goal = (settingsData as any)?.monthly_goal ?? null;
      setMonthlyGoal(goal ? parseFloat(goal) : null);
      setCurrency((settingsData as any)?.currency ?? "USD");

      // Fetch completed tasks this month with a value
      const { data: tasks } = await supabase
        .from("job_tasks")
        .select("assigned_to, value")
        .eq("status", "completed")
        .gte("updated_at", startOfMonth)
        .gt("value" as any, 0);

      if (!tasks || tasks.length === 0) {
        setTotalCompleted(0);
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      // Aggregate by user
      const grouped: Record<string, { tasks: number; value: number }> = {};
      let total = 0;
      for (const t of tasks) {
        if (!t.assigned_to) continue;
        if (!grouped[t.assigned_to]) grouped[t.assigned_to] = { tasks: 0, value: 0 };
        grouped[t.assigned_to].tasks += 1;
        grouped[t.assigned_to].value += parseFloat((t as any).value) || 0;
        total += parseFloat((t as any).value) || 0;
      }
      setTotalCompleted(total);

      // Fetch names
      const userIds = Object.keys(grouped);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name || "Unknown"]));

      const board: LeaderboardEntry[] = userIds.map(uid => ({
        user_id: uid,
        full_name: nameMap.get(uid) || "Unknown",
        tasks_completed: grouped[uid].tasks,
        total_value: grouped[uid].value,
      })).sort((a, b) => b.total_value - a.total_value);

      setLeaderboard(board);
      setLoading(false);
    };

    load();
  }, []);

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2 });
  const progress = monthlyGoal && monthlyGoal > 0 ? Math.min(100, (totalCompleted / monthlyGoal) * 100) : 0;
  const progressPct = Math.round(progress);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Goals</h2>
          <p className="text-muted-foreground">{monthLabel} — company performance</p>
        </div>

        {/* Monthly goal progress */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 text-violet-600 border border-violet-200 flex items-center justify-center shrink-0">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Monthly Revenue Goal</CardTitle>
              <CardDescription>
                {monthlyGoal ? `Target: ${fmt(monthlyGoal)}` : "No goal set — admin can set one in Settings → Billing"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold">{fmt(totalCompleted)}</p>
                <p className="text-sm text-muted-foreground">completed this month</p>
              </div>
              {monthlyGoal && monthlyGoal > 0 && (
                <p className="text-2xl font-semibold text-muted-foreground">{progressPct}%</p>
              )}
            </div>
            {monthlyGoal && monthlyGoal > 0 && (
              <Progress value={progressPct} className="h-3" />
            )}
            {monthlyGoal && monthlyGoal > 0 && totalCompleted >= monthlyGoal && (
              <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                <Trophy className="h-4 w-4" />Goal reached! Great work this month.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Leaderboard</CardTitle>
              <CardDescription>Completed task value this month · highest first</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No completed tasks with a monetary value this month yet.
              </p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, idx) => {
                  const isMe = entry.user_id === user?.id;
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center justify-between rounded-lg px-4 py-3 border ${isMe ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-6 text-center">
                          {medals[idx] ?? <span className="text-sm font-mono text-muted-foreground">#{idx + 1}</span>}
                        </span>
                        <div>
                          <p className="font-medium text-sm">
                            {entry.full_name}
                            {isMe && <Badge variant="secondary" className="ml-2 text-xs">You</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">{entry.tasks_completed} task{entry.tasks_completed !== 1 ? "s" : ""} completed</p>
                        </div>
                      </div>
                      <p className="font-bold text-base font-mono">{fmt(entry.total_value)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
