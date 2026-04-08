import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Target, TrendingUp, RefreshCw, Maximize2, Minimize2, CalendarDays, Wrench } from "lucide-react";

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
  const [workshopName, setWorkshopName] = useState("Workshop");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [dailyCompleted, setDailyCompleted] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const load = useCallback(async () => {
    setRefreshing(true);

    const { data: settingsData } = await supabase
      .from("workshop_settings")
      .select("monthly_goal, currency, workshop_name, logo_url")
      .eq("id", 1)
      .maybeSingle();

    const goal = (settingsData as any)?.monthly_goal ?? null;
    setMonthlyGoal(goal ? parseFloat(goal) : null);
    setCurrency((settingsData as any)?.currency ?? "USD");
    setWorkshopName((settingsData as any)?.workshop_name ?? "Workshop");
    setLogoUrl((settingsData as any)?.logo_url ?? null);

    const { data: tasks } = await supabase
      .from("job_tasks")
      .select("assigned_to, value, updated_at")
      .eq("status", "completed")
      .gte("updated_at", startOfMonth)
      .gt("value" as any, 0);

    if (!tasks || tasks.length === 0) {
      setTotalCompleted(0);
      setDailyCompleted(0);
      setLeaderboard([]);
      setLoading(false);
      setLastRefreshed(new Date());
      setRefreshing(false);
      return;
    }

    const grouped: Record<string, { tasks: number; value: number }> = {};
    let total = 0;
    let daily = 0;

    for (const t of tasks) {
      if (!t.assigned_to) continue;
      if (!grouped[t.assigned_to]) grouped[t.assigned_to] = { tasks: 0, value: 0 };
      const v = parseFloat((t as any).value) || 0;
      grouped[t.assigned_to].tasks += 1;
      grouped[t.assigned_to].value += v;
      total += v;
      if (t.updated_at && t.updated_at >= startOfDay) {
        daily += v;
      }
    }

    setTotalCompleted(total);
    setDailyCompleted(daily);

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
    setLastRefreshed(new Date());
    setRefreshing(false);
  }, [startOfMonth, startOfDay]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("goals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "job_tasks" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2 });
  const monthlyProgress = monthlyGoal && monthlyGoal > 0 ? Math.min(100, (totalCompleted / monthlyGoal) * 100) : 0;
  const monthlyPct = Math.round(monthlyProgress);
  const dailyTarget = monthlyGoal && monthlyGoal > 0 ? monthlyGoal / daysInMonth : null;
  const dailyProgress = dailyTarget ? Math.min(100, (dailyCompleted / dailyTarget) * 100) : 0;
  const dailyPct = Math.round(dailyProgress);
  const medals = ["🥇", "🥈", "🥉"];

  const controls = (dark?: boolean) => (
    <div className="flex items-center gap-2">
      {lastRefreshed && (
        <span className={`text-xs ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
          Updated {lastRefreshed.toLocaleTimeString()}
        </span>
      )}
      <Button
        variant={dark ? "outline" : "outline"}
        size="sm"
        onClick={load}
        disabled={refreshing}
        className={dark ? "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" : ""}
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        <span className="ml-1">Refresh</span>
      </Button>
      <Button
        variant={dark ? "outline" : "outline"}
        size="sm"
        onClick={toggleFullscreen}
        className={dark ? "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" : ""}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        <span className="ml-1">{isFullscreen ? "Exit" : "Fullscreen"}</span>
      </Button>
    </div>
  );

  const pageHeader = (dark?: boolean) => (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {logoUrl ? (
          <img src={logoUrl} alt={workshopName} className={`shrink-0 rounded-xl object-contain ${dark ? "h-14 w-14" : "h-10 w-10"}`} />
        ) : (
          <div className={`shrink-0 rounded-xl flex items-center justify-center ${dark ? "h-14 w-14 bg-white/10" : "h-10 w-10 bg-primary/10"}`}>
            <Wrench className={dark ? "h-7 w-7 text-white/70" : "h-5 w-5 text-primary"} />
          </div>
        )}
        <div>
          <h1 className={`font-bold leading-tight ${dark ? "text-3xl text-white" : "text-2xl"}`}>{workshopName}</h1>
          <p className={`${dark ? "text-slate-400 text-sm" : "text-muted-foreground text-sm"}`}>
            {monthLabel} · Production Goals
            {!loading && <span className={`ml-2 inline-flex items-center gap-1 ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live
            </span>}
          </p>
        </div>
      </div>
      {controls(dark)}
    </div>
  );

  const statCards = (dark?: boolean) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Daily */}
      <div className={`rounded-2xl border p-6 space-y-3 ${dark ? "bg-white/5 border-white/10" : "bg-card border"}`}>
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${dark ? "bg-sky-500/20 text-sky-400" : "bg-sky-500/10 text-sky-600 border border-sky-200"}`}>
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <p className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-slate-400" : "text-muted-foreground"}`}>Today</p>
            <p className={`text-xs ${dark ? "text-slate-500" : "text-muted-foreground/70"}`}>
              {dailyTarget ? `Target ${fmt(dailyTarget)}` : "No daily target"}
            </p>
          </div>
        </div>
        <p className={`font-bold ${dark ? "text-5xl text-white" : "text-4xl"}`}>{fmt(dailyCompleted)}</p>
        {dailyTarget && dailyTarget > 0 && (
          <>
            <Progress value={dailyPct} className={`h-3 ${dark ? "[&>div]:bg-sky-400" : ""}`} />
            <div className="flex justify-between items-center">
              <span className={`text-sm ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
                {dailyPct}% of daily target
              </span>
              {dailyCompleted >= dailyTarget && (
                <span className={`text-sm font-semibold flex items-center gap-1 ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                  <Trophy className="h-3.5 w-3.5" /> Done!
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Monthly */}
      <div className={`rounded-2xl border p-6 space-y-3 ${dark ? "bg-white/5 border-white/10" : "bg-card border"}`}>
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${dark ? "bg-violet-500/20 text-violet-400" : "bg-violet-500/10 text-violet-600 border border-violet-200"}`}>
            <Target className="h-4 w-4" />
          </div>
          <div>
            <p className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-slate-400" : "text-muted-foreground"}`}>This Month</p>
            <p className={`text-xs ${dark ? "text-slate-500" : "text-muted-foreground/70"}`}>
              {monthlyGoal ? `Goal ${fmt(monthlyGoal)}` : "No goal set"}
            </p>
          </div>
        </div>
        <p className={`font-bold ${dark ? "text-5xl text-white" : "text-4xl"}`}>{fmt(totalCompleted)}</p>
        {monthlyGoal && monthlyGoal > 0 && (
          <>
            <Progress value={monthlyPct} className={`h-3 ${dark ? "[&>div]:bg-violet-400" : ""}`} />
            <div className="flex justify-between items-center">
              <span className={`text-sm ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
                {monthlyPct}% of monthly goal
              </span>
              {totalCompleted >= monthlyGoal && (
                <span className={`text-sm font-semibold flex items-center gap-1 ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                  <Trophy className="h-3.5 w-3.5" /> Goal reached!
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const leaderboardCard = (dark?: boolean) => (
    <div className={`rounded-2xl border ${dark ? "bg-white/5 border-white/10" : "bg-card border"}`}>
      <div className={`flex items-center gap-3 p-6 pb-4 border-b ${dark ? "border-white/10" : ""}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${dark ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/10 text-amber-600 border border-amber-200"}`}>
          <TrendingUp className="h-4 w-4" />
        </div>
        <div>
          <p className={`font-semibold ${dark ? "text-white" : ""}`}>Leaderboard</p>
          <p className={`text-xs ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
            Completed task value this month · highest first
          </p>
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <p className={`text-sm py-8 text-center ${dark ? "text-slate-400" : "text-muted-foreground"}`}>Loading...</p>
        ) : leaderboard.length === 0 ? (
          <p className={`text-sm py-8 text-center ${dark ? "text-slate-400" : "text-muted-foreground"}`}>
            No completed tasks with a monetary value this month yet.
          </p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, idx) => {
              const isMe = entry.user_id === user?.id;
              const isTop3 = idx < 3;
              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 transition-colors
                    ${dark
                      ? isMe
                        ? "bg-violet-500/20 border border-violet-500/30"
                        : isTop3
                          ? "bg-amber-500/10 border border-amber-500/10"
                          : "bg-white/5 border border-white/5"
                      : isMe
                        ? "bg-primary/5 border border-primary/20"
                        : "bg-muted/30 border border-transparent"
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-center shrink-0 ${dark ? "text-2xl w-8" : "text-lg w-6"}`}>
                      {medals[idx] ?? <span className={`font-mono font-medium ${dark ? "text-slate-400 text-sm" : "text-muted-foreground text-sm"}`}>#{idx + 1}</span>}
                    </span>
                    <div>
                      <p className={`font-semibold ${dark ? "text-lg text-white" : "text-sm"}`}>
                        {entry.full_name}
                        {isMe && (
                          <Badge variant="secondary" className={`ml-2 text-xs ${dark ? "bg-violet-500/30 text-violet-300 border-violet-500/30" : ""}`}>
                            You
                          </Badge>
                        )}
                      </p>
                      <p className={`${dark ? "text-sm text-slate-400" : "text-xs text-muted-foreground"}`}>
                        {entry.tasks_completed} task{entry.tasks_completed !== 1 ? "s" : ""} completed
                      </p>
                    </div>
                  </div>
                  <p className={`font-bold font-mono ${dark ? "text-2xl text-white" : "text-base"}`}>
                    {fmt(entry.total_value)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // Fullscreen overlay
  const fullscreenContent = (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-auto">
      <div className="min-h-full p-8 space-y-6 max-w-5xl mx-auto">
        {pageHeader(true)}
        {statCards(true)}
        {leaderboardCard(true)}
      </div>
    </div>
  );

  return (
    <>
      {isFullscreen && fullscreenContent}
      <DashboardLayout>
        <div className="space-y-6 max-w-3xl">
          {pageHeader(false)}
          {statCards(false)}
          {leaderboardCard(false)}
        </div>
      </DashboardLayout>
    </>
  );
}
