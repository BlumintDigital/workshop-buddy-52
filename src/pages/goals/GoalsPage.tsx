import { useCallback, useEffect, useState } from "react";
import { Player } from "@remotion/player";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Trophy, Target, TrendingUp, RefreshCw, Maximize2, Minimize2,
  CalendarDays, Flag, Zap, Star,
} from "lucide-react";
import { GoalsBackground } from "./GoalsAnimations";
import { resolveLogoUrl, useDefaultLogoOnError } from "@/lib/branding";

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  tasks_completed: number;
  total_value: number;
}

const SLOGANS = [
  { top: "EVERY TASK COUNTS.", bottom: "LET'S MAKE IT HAPPEN!" },
  { top: "TOGETHER WE CAN DO IT.", bottom: "FINISH STRONG & WIN!" },
  { top: "GREAT TEAMS ACHIEVE", bottom: "GREAT THINGS!" },
  { top: "KEEP PUSHING.", bottom: "THE GOAL IS IN SIGHT!" },
  { top: "ONE TASK AT A TIME.", bottom: "ONE STEP CLOSER!" },
];

// Mini animated bar chart showing monthly progress visually
function ProgressBars({ pct, color }: { pct: number; color: string }) {
  const bars = 12;
  const filled = Math.round((pct / 100) * bars);
  return (
    <div className="flex items-end gap-1 h-16">
      {Array.from({ length: bars }).map((_, i) => {
        const height = 20 + (i / bars) * 80; // rising heights
        const isFilled = i < filled;
        return (
          <div
            key={i}
            className="flex-1 rounded-t transition-all duration-700"
            style={{
              height: `${height}%`,
              backgroundColor: isFilled ? color : "rgba(255,255,255,0.08)",
              boxShadow: isFilled ? `0 0 8px ${color}60` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

// Upward trend arrow SVG
function TrendArrow({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 60" className="w-20 h-10" fill="none">
      <polyline
        points="5,55 25,40 45,45 65,25 85,30 115,5"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.8"
      />
      <polygon points="115,5 105,8 110,15" fill={color} opacity="0.9" />
    </svg>
  );
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
  const [sloganIdx, setSloganIdx] = useState(0);
  const [sloganVisible, setSloganVisible] = useState(true);

  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Rotate slogans every 6 seconds with a fade
  useEffect(() => {
    if (!isFullscreen) return;
    const interval = setInterval(() => {
      setSloganVisible(false);
      setTimeout(() => {
        setSloganIdx(i => (i + 1) % SLOGANS.length);
        setSloganVisible(true);
      }, 500);
    }, 6000);
    return () => clearInterval(interval);
  }, [isFullscreen]);

  const load = useCallback(async () => {
    setRefreshing(true);

    const { data: settingsData } = await supabase
      .from("workshop_settings")
      .select("currency, workshop_name, logo_url")
      .eq("id", 1)
      .maybeSingle();

    setCurrency((settingsData as any)?.currency ?? "USD");
    setWorkshopName((settingsData as any)?.workshop_name ?? "Workshop");
    setLogoUrl((settingsData as any)?.logo_url ?? null);

    // Read goal from per-month table
    const { data: goalData } = await (supabase as any)
      .from("monthly_revenue_goals")
      .select("goal_amount")
      .eq("year", now.getFullYear())
      .eq("month", now.getMonth() + 1)
      .maybeSingle();
    setMonthlyGoal(goalData ? parseFloat(goalData.goal_amount) : null);

    const { data: tasks } = await (supabase
      .from("job_tasks")
      .select("assigned_to, value, updated_at")
      .eq("status", "completed")
      .gte("updated_at", startOfMonth)
      .gt("value" as any, 0) as any);

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
      if (t.updated_at && t.updated_at >= startOfDay) daily += v;
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
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2 });
  const monthlyProgress = monthlyGoal && monthlyGoal > 0 ? Math.min(100, (totalCompleted / monthlyGoal) * 100) : 0;
  const monthlyPct = Math.round(monthlyProgress);
  const dailyTarget = monthlyGoal && monthlyGoal > 0 ? monthlyGoal / daysInMonth : null;
  const dailyProgress = dailyTarget ? Math.min(100, (dailyCompleted / dailyTarget) * 100) : 0;
  const dailyPct = Math.round(dailyProgress);
  const medals = ["🥇", "🥈", "🥉"];
  const goalReached = monthlyGoal != null && monthlyGoal > 0 && totalCompleted >= monthlyGoal;
  const slogan = SLOGANS[sloganIdx];

  // ── Normal (non-fullscreen) layout ──────────────────────────────────────────
  const controls = (
    <div className="flex items-center gap-2">
      {lastRefreshed && (
        <span className="text-xs text-muted-foreground">Updated {lastRefreshed.toLocaleTimeString()}</span>
      )}
      <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        <span className="ml-1">Refresh</span>
      </Button>
      <Button variant="outline" size="sm" onClick={toggleFullscreen}>
        <Maximize2 className="h-4 w-4" /><span className="ml-1">Fullscreen</span>
      </Button>
    </div>
  );

  const normalView = (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <img src={resolveLogoUrl(logoUrl)} alt={workshopName} className="h-20 w-20 shrink-0 rounded-2xl object-contain drop-shadow-lg" onError={useDefaultLogoOnError} />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{workshopName}</h2>
              <p className="text-muted-foreground text-sm">{monthLabel} · Production Goals</p>
            </div>
          </div>
          {controls}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-sky-500/10 text-sky-600 border border-sky-200">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Today</p>
                <p className="text-xs text-muted-foreground/70">{dailyTarget ? `Target ${fmt(dailyTarget)}` : "No daily target"}</p>
              </div>
            </div>
            <p className="text-4xl font-bold tabular-nums">{fmt(dailyCompleted)}</p>
            {dailyTarget && dailyTarget > 0 && (
              <>
                <Progress value={dailyPct} className="h-3" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{dailyPct}% of daily target</span>
                  {dailyCompleted >= dailyTarget && (
                    <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Done!</span>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="rounded-2xl border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-600 border border-violet-200">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">This Month</p>
                <p className="text-xs text-muted-foreground/70">{monthlyGoal ? `Goal ${fmt(monthlyGoal)}` : "No goal set"}</p>
              </div>
            </div>
            <p className="text-4xl font-bold tabular-nums">{fmt(totalCompleted)}</p>
            {monthlyGoal && monthlyGoal > 0 && (
              <>
                <Progress value={monthlyPct} className="h-3" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{monthlyPct}% of monthly goal</span>
                  {goalReached && (
                    <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Goal reached!</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center gap-3 p-6 pb-4 border-b">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 border border-amber-200">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">Leaderboard</p>
              <p className="text-xs text-muted-foreground">Completed task value this month · highest first</p>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <p className="text-sm py-8 text-center text-muted-foreground">Loading…</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm py-8 text-center text-muted-foreground">No completed tasks with a monetary value this month yet.</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, idx) => (
                  <div key={entry.user_id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${entry.user_id === user?.id ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg w-6 text-center">{medals[idx] ?? <span className="text-sm font-mono text-muted-foreground">#{idx + 1}</span>}</span>
                      <div>
                        <p className="font-medium text-sm">{entry.full_name}{entry.user_id === user?.id && <Badge variant="secondary" className="ml-2 text-xs">You</Badge>}</p>
                        <p className="text-xs text-muted-foreground">{entry.tasks_completed} task{entry.tasks_completed !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <p className="font-bold text-base font-mono">{fmt(entry.total_value)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );

  // ── Fullscreen scoreboard layout ─────────────────────────────────────────────
  const fullscreenContent = (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: "#050d1a" }}>

      {/* Remotion animated background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Player
          component={GoalsBackground}
          durationInFrames={360}
          compositionWidth={window.innerWidth || 1920}
          compositionHeight={window.innerHeight || 1080}
          fps={30}
          loop
          autoPlay
          controls={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Gradient overlay for readability */}
      <div className="fixed inset-0 z-10 pointer-events-none" style={{
        background: "linear-gradient(135deg, rgba(5,13,26,0.82) 0%, rgba(10,18,38,0.65) 50%, rgba(5,13,26,0.82) 100%)"
      }} />

      {/* Goal achieved celebration overlay */}
      {goalReached && (
        <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
          {/* Corner flag banners */}
          <div className="absolute top-0 left-0 w-48 h-48 opacity-20"
            style={{ background: "radial-gradient(circle at 0% 0%, #f59e0b, transparent)" }} />
          <div className="absolute top-0 right-0 w-48 h-48 opacity-20"
            style={{ background: "radial-gradient(circle at 100% 0%, #f59e0b, transparent)" }} />
          {/* Shimmer stripe */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-70"
            style={{ animation: "shimmer 2s ease-in-out infinite" }} />
          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-70"
            style={{ animation: "shimmer 2s ease-in-out infinite 1s" }} />
        </div>
      )}

      {/* Main content */}
      <div className="relative z-20 h-full flex flex-col p-6 gap-4 overflow-hidden">

        {/* ── TOP BAR: Logo + slogan + controls ── */}
        <div className="flex items-center justify-between gap-6 shrink-0">
          {/* Logo + name */}
          <div className="flex items-center gap-4">
            <img
              src={resolveLogoUrl(logoUrl)}
              alt={workshopName}
              className="h-20 w-20 shrink-0 rounded-2xl object-contain drop-shadow-2xl ring-2 ring-white/10"
              onError={useDefaultLogoOnError}
            />
            <div>
              <p className="text-white/60 text-sm font-medium uppercase tracking-widest">{monthLabel}</p>
              <h1 className="text-3xl font-black text-white leading-tight tracking-tight">{workshopName}</h1>
            </div>
          </div>

          {/* Goal achieved badge */}
          {goalReached && (
            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-3 px-6 py-3 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 backdrop-blur-sm">
                <Flag className="h-6 w-6 text-yellow-400" />
                <span className="text-yellow-300 font-black text-xl tracking-widest uppercase">Goal Achieved!</span>
                <Trophy className="h-6 w-6 text-yellow-400" />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {lastRefreshed && (
              <span className="text-slate-500 text-xs hidden lg:block">Updated {lastRefreshed.toLocaleTimeString()}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={refreshing}
              className="gap-1.5 border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white/70"
            >
              <RefreshCw className={`h-3.5 w-3.5${refreshing ? " animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="gap-1.5 border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white/70"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Exit
            </Button>
          </div>
        </div>

        {/* ── MAIN BODY: Left stats + Right leaderboard ── */}
        <div className="flex-1 grid grid-cols-5 gap-5 min-h-0">

          {/* LEFT PANEL — 3/5 */}
          <div className="col-span-3 flex flex-col gap-4">

            {/* Motivational slogan */}
            <div
              className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-8 py-5 flex flex-col justify-center"
              style={{
                transition: "opacity 0.5s ease",
                opacity: sloganVisible ? 1 : 0,
                minHeight: "5rem",
              }}
            >
              <p className="text-yellow-400 text-sm font-bold uppercase tracking-[0.25em] mb-1">
                {slogan.top}
              </p>
              <p className="text-white text-2xl font-black uppercase tracking-tight leading-tight">
                {slogan.bottom}
              </p>
              <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest">Every effort counts</p>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-4 flex-1">

              {/* TODAY */}
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 backdrop-blur-sm p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sky-400 text-xs font-bold uppercase tracking-widest">Today</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {dailyTarget ? `Target ${fmt(dailyTarget)}` : "Production"}
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-500/20">
                    <Zap className="h-4 w-4 text-sky-400" />
                  </div>
                </div>

                <div>
                  <p className="text-white font-black tabular-nums leading-none" style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)" }}>
                    {fmt(dailyCompleted)}
                  </p>
                  {dailyTarget && (
                    <p className="text-sky-400 text-sm font-bold mt-1">{dailyPct}% complete</p>
                  )}
                </div>

                <div className="mt-auto space-y-2">
                  <ProgressBars pct={dailyPct} color="#38bdf8" />
                  <TrendArrow color="#38bdf8" />
                </div>
              </div>

              {/* THIS MONTH */}
              <div className={`rounded-2xl backdrop-blur-sm p-5 flex flex-col gap-3 ${goalReached
                ? "border border-yellow-400/30 bg-yellow-400/5"
                : "border border-violet-500/20 bg-violet-500/5"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest ${goalReached ? "text-yellow-400" : "text-violet-400"}`}>
                      This Month
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {monthlyGoal ? `Goal ${fmt(monthlyGoal)}` : "No goal set"}
                    </p>
                  </div>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${goalReached ? "bg-yellow-400/20" : "bg-violet-500/20"}`}>
                    {goalReached
                      ? <Trophy className="h-4 w-4 text-yellow-400" />
                      : <Target className="h-4 w-4 text-violet-400" />
                    }
                  </div>
                </div>

                <div>
                  <p className={`font-black tabular-nums leading-none ${goalReached ? "text-yellow-300" : "text-white"}`}
                    style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)" }}>
                    {fmt(totalCompleted)}
                  </p>
                  <p className={`text-sm font-bold mt-1 ${goalReached ? "text-yellow-400" : "text-violet-400"}`}>
                    {monthlyPct}% {goalReached ? "— GOAL REACHED!" : "of goal"}
                  </p>
                </div>

                <div className="mt-auto space-y-2">
                  <ProgressBars pct={monthlyPct} color={goalReached ? "#fbbf24" : "#a78bfa"} />
                  <TrendArrow color={goalReached ? "#fbbf24" : "#a78bfa"} />
                </div>
              </div>
            </div>

            {/* Live indicator bar */}
            <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/3 px-5 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-emerald-400 text-xs font-semibold uppercase tracking-widest">Live · Auto-updates</span>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`h-3 w-3 ${i < Math.min(5, Math.ceil(monthlyPct / 20)) ? "text-yellow-400" : "text-white/10"}`} fill={i < Math.min(5, Math.ceil(monthlyPct / 20)) ? "currentColor" : "none"} />
                ))}
                <span className="text-white/30 text-xs ml-2">{monthlyPct}% to goal</span>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — 2/5 leaderboard */}
          <div className="col-span-2 flex flex-col rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0"
              style={{ background: "linear-gradient(90deg, rgba(245,158,11,0.12), transparent)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/20">
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="font-black text-white uppercase tracking-widest text-sm">Leaderboard</p>
                <p className="text-xs text-slate-400">Top performers · {monthLabel}</p>
              </div>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <p className="text-slate-400 text-sm py-8 text-center">Loading…</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-slate-400 text-sm py-8 text-center">No completed tasks yet this month.</p>
              ) : (
                leaderboard.map((entry, idx) => {
                  const isMe = entry.user_id === user?.id;
                  const rankColors = ["from-yellow-500/20 border-yellow-400/30", "from-slate-400/15 border-slate-400/20", "from-amber-700/20 border-amber-600/20"];
                  const valueColors = ["text-yellow-300", "text-slate-200", "text-amber-400"];
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 border bg-gradient-to-r ${isMe
                        ? "from-violet-500/20 border-violet-400/30"
                        : rankColors[idx] ?? "from-white/5 border-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl w-8 text-center shrink-0">
                          {medals[idx] ?? <span className="text-slate-500 text-sm font-mono">#{idx + 1}</span>}
                        </span>
                        <div>
                          <p className="text-white font-bold text-base leading-tight">
                            {entry.full_name}
                            {isMe && <span className="ml-2 text-xs text-violet-300 font-normal">(you)</span>}
                          </p>
                          <p className="text-slate-400 text-xs">{entry.tasks_completed} task{entry.tasks_completed !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <p className={`font-black font-mono tabular-nums text-xl ${isMe ? "text-violet-300" : valueColors[idx] ?? "text-white"}`}>
                        {fmt(entry.total_value)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CSS for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );

  return (
    <>
      {isFullscreen && fullscreenContent}
      {normalView}
    </>
  );
}
