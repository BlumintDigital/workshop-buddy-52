import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getRoleDashboardPath, useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Summary = { delivered_value: number; projects_finished: number; projects_shipped: number; hours_logged: number; handoffs: number };
type Person = { user_id: string; full_name: string; role: string; hours: number; handoffs: number; task_value: number; projects: number };

const REFRESH_MS = 5 * 60 * 1000;

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
  return { start, end, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
}

/**
 * The workshop's month at a glance, built for a screen on the workshop floor:
 * no app menu, large figures, and it keeps itself up to date. Individual labour
 * costs are left out because everyone can see this screen; they stay in Reports.
 */
export default function GoalsPage() {
  const { user, role, extendSession } = useAuth();
  const { format: fmt } = useCurrency();
  const { has } = usePermissions();
  const [offset, setOffset] = useState(0);
  const [goal, setGoal] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const range = useMemo(() => monthRange(offset), [offset]);

  const load = useCallback(async () => {
    const [g, s, p] = await Promise.all([
      supabase.from("monthly_revenue_goals").select("goal_amount").eq("year", range.start.getFullYear()).eq("month", range.start.getMonth() + 1).maybeSingle(),
      supabase.rpc("goal_summary", { _from: range.start.toISOString(), _to: range.end.toISOString() }),
      supabase.rpc("team_performance", { _from: range.start.toISOString(), _to: range.end.toISOString() }),
    ]);
    setGoal(g.data ? Number(g.data.goal_amount) : null);
    const row = (s.data ?? [])[0];
    setSummary(row ? { delivered_value: Number(row.delivered_value), projects_finished: Number(row.projects_finished), projects_shipped: Number(row.projects_shipped), hours_logged: Number(row.hours_logged), handoffs: Number(row.handoffs) } : null);
    setPeople(
      ((p.data ?? []) as Person[])
        .map((x) => ({ ...x, hours: Number(x.hours), handoffs: Number(x.handoffs), task_value: Number(x.task_value), projects: Number(x.projects) }))
        .filter((x) => x.hours > 0 || x.handoffs > 0 || x.task_value > 0),
    );
    setRefreshedAt(new Date());
    setLoading(false);
  }, [range]);

  useEffect(() => {
    setLoading(true);
    void load();
    // The screen keeps itself up to date, and counts as activity so a wall
    // display isn't signed out after 30 minutes. Only while this page is open.
    const id = setInterval(() => {
      void load();
      if (document.visibilityState === "visible") extendSession();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, extendSession]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const delivered = summary?.delivered_value ?? 0;
  const pct = goal && goal > 0 ? Math.min(100, Math.round((delivered / goal) * 100)) : null;
  const daysInMonth = range.end.getDate();
  const dayOfMonth = offset === 0 ? new Date().getDate() : daysInMonth;
  const expectedPct = Math.round((dayOfMonth / daysInMonth) * 100);
  const pace = pct == null ? null : pct >= 100 ? "reached" : pct >= expectedPct ? "ahead" : "behind";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6 lg:gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {!fullscreen && (
              <Button asChild variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Back to Shoplane">
                <Link to={getRoleDashboardPath(role)}>
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Goals</h1>
              <p className="text-sm text-muted-foreground lg:text-base">
                {range.label}
                {refreshedAt && ` · updated ${refreshedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(offset)} onValueChange={(v) => setOffset(Number(v))}>
              <SelectTrigger className="h-10 w-40" aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, -1, -2, -3].map((o) => (
                  <SelectItem key={o} value={String(o)}>
                    {o === 0 ? "This month" : monthRange(o).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Refresh" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-10" onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 className="mr-1.5 h-4 w-4" aria-hidden /> : <Maximize2 className="mr-1.5 h-4 w-4" aria-hidden />}
              {fullscreen ? "Exit full screen" : "Full screen"}
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <section aria-label="Monthly goal" className="space-y-4 rounded-xl border bg-card p-5 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground lg:text-base">{offset === 0 ? "Delivered this month" : `Delivered in ${range.label}`}</p>
                  <p className="text-5xl font-semibold tabular-nums tracking-tight lg:text-7xl">{fmt(delivered)}</p>
                  <p className="text-sm text-muted-foreground lg:text-base">
                    Agreed value of projects that passed their quality check{goal ? ` · goal ${fmt(goal)}` : ""}
                  </p>
                </div>
                {pace && (
                  <StatusPill tone={pace === "behind" ? "warning" : "success"}>
                    {pace === "reached" ? "Goal reached!" : pace === "ahead" ? "Ahead of pace" : "Behind pace"}
                  </StatusPill>
                )}
              </div>
              {pct != null ? (
                <div className="space-y-2">
                  <Progress value={pct} aria-label="Monthly goal progress" className="h-4 lg:h-6" />
                  <p className="text-sm text-muted-foreground lg:text-base">
                    {pct}% of the monthly goal{offset === 0 && pct < 100 ? ` · ${expectedPct}% of the month has gone` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No goal set for this month. An admin can set one in Settings, under Billing.</p>
              )}
            </section>

            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {[
                ["Projects finished", summary?.projects_finished ?? 0],
                ["Shipped", summary?.projects_shipped ?? 0],
                ["Hours logged", Math.round((summary?.hours_logged ?? 0) * 10) / 10],
                ["Tasks handed off", summary?.handoffs ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-card p-4 lg:p-6">
                  <dt className="text-xs font-medium text-muted-foreground lg:text-sm">{label}</dt>
                  <dd className="text-3xl font-semibold tabular-nums lg:text-5xl">{value}</dd>
                </div>
              ))}
            </dl>

            <section aria-label="Team" className="flex-1 rounded-xl border bg-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3 lg:px-8 lg:py-4">
                <h2 className="text-base font-semibold lg:text-xl">Team</h2>
                <p className="text-xs text-muted-foreground lg:text-sm">
                  Work value is each finished task's share of its project's agreed quote.
                  {has("reports") && !fullscreen && (
                    <>
                      {" "}
                      <Link to="/reports?tab=team" className="font-medium text-primary underline-offset-2 hover:underline">
                        Costs and full team report
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {people.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground lg:text-base">Nothing logged yet this month.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm lg:text-lg">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground lg:text-sm">
                        <th scope="col" className="px-5 py-2 font-medium lg:px-8">#</th>
                        <th scope="col" className="px-2 py-2 font-medium">Person</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Work value</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Hours</th>
                        <th scope="col" className="px-5 py-2 text-right font-medium lg:px-8">Handoffs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((p, i) => (
                        <tr key={p.user_id} className={cn("border-b last:border-0", p.user_id === user?.id && !fullscreen && "bg-primary-soft")}>
                          <td className="px-5 py-2.5 tabular-nums text-muted-foreground lg:px-8 lg:py-3.5">{i + 1}</td>
                          <td className="px-2 py-2.5 font-medium lg:py-3.5">{p.full_name}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums lg:py-3.5">{fmt(p.task_value)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums lg:py-3.5">{Math.round(p.hours * 10) / 10}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums lg:px-8 lg:py-3.5">{p.handoffs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
