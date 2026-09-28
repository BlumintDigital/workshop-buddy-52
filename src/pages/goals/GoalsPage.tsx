import { useCallback, useEffect, useMemo, useState } from "react";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Summary = { delivered_value: number; projects_finished: number; projects_shipped: number; hours_logged: number; handoffs: number };
type Person = { user_id: string; full_name: string; role: string; hours: number; handoffs: number; task_value: number; projects: number; labour_cost: number | null };

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
  return { start, end, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
}

/**
 * The workshop's month at a glance: work delivered against the monthly goal,
 * and what each person contributed. Labour cost and value for money only show
 * for people with Reports and costs. "Show on a screen" makes it a wall display.
 */
export default function GoalsPage() {
  const { user } = useAuth();
  const { format: fmt } = useCurrency();
  const { has } = usePermissions();
  const [offset, setOffset] = useState(0);
  const [goal, setGoal] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [wall, setWall] = useState(false);
  const range = useMemo(() => monthRange(offset), [offset]);
  const seesCost = has("reports");

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
        .map((x) => ({ ...x, hours: Number(x.hours), handoffs: Number(x.handoffs), task_value: Number(x.task_value), projects: Number(x.projects), labour_cost: x.labour_cost == null ? null : Number(x.labour_cost) }))
        .filter((x) => x.hours > 0 || x.handoffs > 0 || x.task_value > 0),
    );
    setRefreshedAt(new Date());
    setLoading(false);
  }, [range]);

  useEffect(() => {
    setLoading(true);
    void load();
    // A wall display keeps itself up to date.
    const id = setInterval(() => void load(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onChange = () => setWall(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleWall = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => setWall((w) => !w));
  };

  const delivered = summary?.delivered_value ?? 0;
  const pct = goal && goal > 0 ? Math.min(100, Math.round((delivered / goal) * 100)) : null;
  const daysInMonth = range.end.getDate();
  const dayOfMonth = offset === 0 ? new Date().getDate() : daysInMonth;
  const expectedPct = Math.round((dayOfMonth / daysInMonth) * 100);
  const pace = pct == null ? null : pct >= 100 ? "reached" : pct >= expectedPct ? "ahead" : "behind";

  const content = (
    <div className={cn("mx-auto min-w-0 space-y-4", wall ? "max-w-none p-6" : "max-w-5xl")}>
      <PageBar
        title="Goals"
        subtitle={`${range.label}${refreshedAt ? ` · updated ${refreshedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}`}
        actions={
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
            <Button variant="outline" className="h-10" onClick={toggleWall}>
              {wall ? <Minimize2 className="mr-1.5 h-4 w-4" aria-hidden /> : <Maximize2 className="mr-1.5 h-4 w-4" aria-hidden />}
              {wall ? "Exit screen mode" : "Show on a screen"}
            </Button>
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <>
          <section aria-label="Monthly goal" className="space-y-3 rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{offset === 0 ? "This Month" : range.label}</p>
                <p className={cn("font-semibold tabular-nums", wall ? "text-6xl" : "text-4xl")}>{fmt(delivered)}</p>
                <p className="text-sm text-muted-foreground">Agreed value of projects that passed their quality check{goal ? ` · goal ${fmt(goal)}` : ""}</p>
              </div>
              {pace && (
                <StatusPill tone={pace === "behind" ? "warning" : "success"}>
                  {pace === "reached" ? "Goal reached!" : pace === "ahead" ? "Ahead of pace" : "Behind pace"}
                </StatusPill>
              )}
            </div>
            {pct != null ? (
              <>
                <Progress value={pct} aria-label="Monthly goal progress" className={wall ? "h-5" : "h-3"} />
                <p className="text-sm text-muted-foreground">
                  {pct}% of monthly goal{offset === 0 && pct < 100 ? ` · ${expectedPct}% of the month has gone` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No goal set for this month. An admin can set one in Settings, under Billing.</p>
            )}
          </section>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Projects finished", summary?.projects_finished ?? 0],
              ["Shipped", summary?.projects_shipped ?? 0],
              ["Hours logged", Math.round((summary?.hours_logged ?? 0) * 10) / 10],
              ["Tasks handed off", summary?.handoffs ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className={cn("font-semibold tabular-nums", wall ? "text-4xl" : "text-2xl")}>{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-label="Team" className="rounded-lg border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="text-base font-semibold">Team</h2>
              <p className="text-xs text-muted-foreground">
                Work value is each finished task's share of its project's agreed quote. Hours logged and handoffs this month{seesCost ? "; labour cost uses each person's hourly cost." : "."}
                {seesCost && (
                  <>
                    {" "}
                    <Link to="/reports?tab=team" className="font-medium text-primary underline-offset-2 hover:underline">
                      Full team report
                    </Link>
                  </>
                )}
              </p>
            </div>
            {people.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing logged yet this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-5 py-2 font-medium">#</th>
                      <th scope="col" className="px-2 py-2 font-medium">Person</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Work value</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Hours</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium">Handoffs</th>
                      {seesCost && <th scope="col" className="px-2 py-2 text-right font-medium">Labour cost</th>}
                      {seesCost && <th scope="col" className="px-5 py-2 text-right font-medium">Value per cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p, i) => {
                      const ratio = p.labour_cost && p.labour_cost > 0 ? p.task_value / p.labour_cost : null;
                      return (
                        <tr key={p.user_id} className={cn("border-b last:border-0", p.user_id === user?.id && "bg-primary-soft")}>
                          <td className="px-5 py-2.5 tabular-nums text-muted-foreground">{i + 1}</td>
                          <td className="px-2 py-2.5 font-medium">
                            {p.full_name}
                            {p.user_id === user?.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{fmt(p.task_value)}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{Math.round(p.hours * 10) / 10}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{p.handoffs}</td>
                          {seesCost && <td className="px-2 py-2.5 text-right tabular-nums">{p.labour_cost == null ? "—" : fmt(p.labour_cost)}</td>}
                          {seesCost && (
                            <td className="px-5 py-2.5 text-right tabular-nums">
                              {ratio == null ? <span className="text-muted-foreground">No rate set</span> : <span className={ratio < 1 ? "text-destructive" : undefined}>{ratio.toFixed(1)}×</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );

  if (wall) return <div className="min-h-screen bg-background">{content}</div>;
  return <DashboardLayout>{content}</DashboardLayout>;
}
