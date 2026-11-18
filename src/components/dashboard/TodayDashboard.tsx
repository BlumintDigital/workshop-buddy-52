import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ChevronDown, Info, Plus, Receipt, RefreshCw, UserPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminOnboardingChecklist } from "@/components/onboarding/AdminOnboardingChecklist";
import { ActivityFeed } from "./ActivityFeed";
import { CardCustomiser } from "./CardCustomiser";
import { CardError } from "./CardError";
import { Figures, MiniBars, MiniSplit, type Figure } from "./Figures";
import { Panel } from "./Panel";
import { JobStatusPill } from "./StatusPill";
import { TodoSummary } from "./TodoSummary";
import { useAttentionItems } from "@/hooks/useAttentionItems";
import { useCurrency } from "@/hooks/useCurrency";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { useFeature } from "@/hooks/useFeatureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useTodayData,
  type OpenJob,
  type RevenuePoint,
  type TeamLoadEntry,
  type TodayAppointment,
  type TodayData,
} from "@/hooks/useTodayData";
import type { CardId } from "@/lib/dashboardCards";
import { todayIso } from "@/lib/dashboardQueries";
import { conversionFigure, efficiencyFigure, plural, type RatioFigure, type TodoItem } from "@/lib/dashboardTodo";
import { cn } from "@/lib/utils";

/** Cards that take the full width; the rest pair up two per row on large screens. */
const WIDE: ReadonlySet<CardId> = new Set(["attention", "onboarding", "figures", "jobs", "revenue", "activity"]);

function formatDue(due: string | null): { text: string; late: boolean } {
  if (!due) return { text: "No due date", late: false };
  const today = todayIso();
  if (due < today) return { text: `Late · ${new Date(due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, late: true };
  if (due === today) return { text: "Due today", late: false };
  return { text: new Date(due).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), late: false };
}

const hours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function Initials({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">
      {initials(name)}
    </span>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-5 py-5 text-sm text-muted-foreground">{children}</p>;
}

const inlineLink = "font-medium text-primary underline-offset-4 hover:underline";

/** The line under the page title: the date, then what To do holds, in words. */
function Summary({ items, ready }: { items: TodoItem[]; ready: boolean }) {
  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  if (!ready) return <>{date}</>;
  const total = items.reduce((sum, i) => sum + (i.count ?? 1), 0);
  const urgent = items.filter((i) => i.severity === "danger").reduce((sum, i) => sum + (i.count ?? 1), 0);
  if (total === 0) return <>{date} · Nothing waiting on you</>;
  return (
    <>
      {date} · {total} {plural(total, "thing", "things")} to do
      {urgent > 0 && (
        <>
          , <span className="font-medium text-destructive">{urgent} urgent</span>
        </>
      )}
    </>
  );
}

function JobsCard({ jobs, total, role }: { jobs: OpenJob[]; total: number; role: "admin" | "manager" }) {
  return (
    <Panel
      title="Projects in progress"
      description={jobs.length > 0 ? `The ${jobs.length} due soonest of ${total} open` : undefined}
      link={{ label: "View all projects", to: `/${role}/projects?status=open` }}
    >
      {jobs.length === 0 ? (
        <EmptyRow>
          No open projects.{" "}
          <Link to="/reception" className={inlineLink}>
            Start one at Reception
          </Link>{" "}
          when work comes in.
        </EmptyRow>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_10rem_8.5rem_7.5rem] gap-x-4 border-b bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Project</span>
            <span>Lead</span>
            <span>Stage</span>
            <span className="text-right">Due</span>
          </div>
          <ul className="divide-y">
            {jobs.map((job) => {
              const due = formatDue(job.due_date);
              return (
                <li key={job.id}>
                  <Link
                    to={`/projects/${job.id}`}
                    className="grid min-h-[60px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_10rem_8.5rem_7.5rem]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{job.title}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{job.ref}</span>
                    </span>
                    <span className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
                      {job.assignee ? (
                        <>
                          <Initials name={job.assignee} />
                          <span className="truncate">{job.assignee}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">No lead</span>
                      )}
                    </span>
                    <span className="justify-self-end sm:justify-self-start">
                      <JobStatusPill status={job.status} />
                    </span>
                    <span
                      className={cn(
                        "col-span-2 text-xs tabular-nums sm:col-span-1 sm:text-right sm:text-sm",
                        due.late ? "font-medium text-destructive" : "text-muted-foreground",
                      )}
                    >
                      <span className="sm:hidden">{job.assignee ?? "No lead"} · </span>
                      {due.text}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ScheduleCard({ appointments, role }: { appointments: TodayAppointment[]; role: "admin" | "manager" }) {
  return (
    <Panel title="Today's appointments" link={{ label: "Open calendar", to: `/${role}/calendar` }} className="h-full">
      {appointments.length === 0 ? (
        <EmptyRow>
          Nothing booked for today.{" "}
          <Link to={`/${role}/appointments`} className={inlineLink}>
            Book an appointment
          </Link>
        </EmptyRow>
      ) : (
        <ul className="divide-y">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link
                to={`/appointments/${a.id}`}
                className="flex min-h-[56px] items-center gap-4 px-5 py-2.5 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="w-12 shrink-0 text-sm font-medium tabular-nums">{(a.appointment_time || "").slice(0, 5)}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{a.title || "Appointment"}</span>
                {a.duration_minutes ? <span className="text-xs tabular-nums text-muted-foreground">{a.duration_minutes} min</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TeamCard({ team, role }: { team: TeamLoadEntry[]; role: "admin" | "manager" }) {
  const max = Math.max(1, ...team.map((t) => t.logged_hours));
  return (
    <Panel
      title="Team load"
      description={team.length > 0 ? "Hours logged this week, and open tasks assigned" : undefined}
      link={{ label: "View team", to: role === "admin" ? "/admin/users" : "/manager/staff" }}
      divided={false}
      className="h-full"
    >
      {team.length === 0 ? (
        <EmptyRow>No hours logged this week and no open tasks assigned. Assign tasks on a project to see who has capacity.</EmptyRow>
      ) : (
        <ul className="space-y-4 px-5 pb-5 pt-1">
          {team.map((t) => (
            <li key={t.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
              <Initials name={t.name} />
              <span className="truncate font-medium">{t.name}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{hours(t.logged_hours)} h</span> · {t.tasks} {plural(t.tasks, "task", "tasks")}
                {t.remaining_hours > 0 ? `, ${hours(t.remaining_hours)} h left` : ""}
              </span>
              <span className="col-span-2 col-start-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(t.logged_hours / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function HowItWorks({ title, how }: { title: string; how: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label={`How ${title.toLowerCase()} is worked out`}>
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm leading-relaxed">
        <p className="font-medium">How it's worked out</p>
        <p className="mt-1 text-muted-foreground">{how}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A ratio with its working: the percentage, a meter, and the counts behind it. With nothing to divide,
 * the card stays short and says why.
 */
function RatioCard({ title, figure, pct, how }: { title: string; figure: RatioFigure; pct: number | null; how: string }) {
  return (
    <Panel title={title} actions={<HowItWorks title={title} how={how} />} divided={false} className="flex h-full flex-col">
      <div className="px-5 pb-5">
        {figure.value ? (
          <>
            <p className="text-[2rem] font-semibold leading-none tabular-nums tracking-tight">{figure.value}</p>
            <span className="mt-4 block h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
            </span>
            <p className="mt-2 text-sm text-muted-foreground">{figure.detail}</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">No figure yet.</span> {figure.detail}.
            </p>
            {/* An empty track where the meter will be, so the pair of cards still lines up. */}
            <span className="mt-4 block h-2 rounded-full border border-dashed" aria-hidden />
          </>
        )}
      </div>
    </Panel>
  );
}

const money = (format: (n: number) => string, n: number) => format(n).replace(/\.00$/, "");

function RevenueCard({ series, format }: { series: RevenuePoint[]; format: (n: number) => string }) {
  const max = Math.max(1, ...series.map((p) => p.value));
  const last = series.length - 1;
  const total = series.reduce((sum, p) => sum + p.value, 0);
  return (
    <Panel
      title="Revenue"
      description="Paid invoices, by the month they were paid"
      link={{ label: "View reports", to: "/reports" }}
      divided={false}
      className="h-full"
    >
      {total === 0 ? (
        <EmptyRow>Nothing paid in the last six months. Paid invoices show here by the month they were paid.</EmptyRow>
      ) : (
        <div className="px-5 pb-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p>
              <span className="text-[2rem] font-semibold leading-none tabular-nums tracking-tight">{money(format, series[last].value)}</span>
              <span className="ml-2 text-sm text-muted-foreground">in {series[last].label}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{money(format, total)}</span> over six months
            </p>
          </div>
          <ol className="relative mt-5 grid h-40 grid-cols-6 items-end gap-3" aria-label="Paid revenue for the last six months">
            {/* Quiet guide lines at the top, middle and base of the scale. */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-5 border-t border-dashed" />
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[calc(50%+0.625rem)] border-t border-dashed" />
            {series.map((p, i) => (
              <li key={p.label} className="relative flex h-full flex-col items-center justify-end">
                <span className="sr-only">
                  {p.label}: {p.value > 0 ? money(format, p.value) : "nothing paid"}
                </span>
                {p.value > 0 && (
                  <span aria-hidden className={cn("mb-1 text-xs tabular-nums", i === last ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {money(format, p.value)}
                  </span>
                )}
                <span
                  aria-hidden
                  className={cn("w-full max-w-16 rounded-t-md", i === last ? "bg-primary" : p.value > 0 ? "bg-primary/30" : "bg-border")}
                  style={{ height: p.value > 0 ? `max(4px, calc(${(p.value / max) * 100}% - 1.25rem))` : "2px" }}
                />
              </li>
            ))}
          </ol>
          <ol aria-hidden className="mt-2 grid grid-cols-6 gap-3 border-t pt-2 text-center text-xs text-muted-foreground">
            {series.map((p, i) => (
              <li key={p.label} className={cn(i === last && "font-medium text-foreground")}>
                {p.label}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}

const EFFICIENCY_HOW =
  "Hours technicians logged on projects this week, divided by the hours available: 7.5 hours a working day for each active technician. Shoplane doesn't record clock-in times, so this uses a standard day.";
const CONVERSION_HOW = "Quotes approved, divided by quotes approved or declined in the last 90 days. Change requests aren't counted.";

interface TodayDashboardProps {
  role: "admin" | "manager";
}

/** The admin and manager home screen: headline figures, what's waiting, then the day's work. Cards are user-configurable. */
export function TodayDashboard({ role }: TodayDashboardProps) {
  const appointmentsEnabled = useFeature("appointments");
  const { format } = useCurrency();
  const { has } = usePermissions();
  const canSeeMoney = has("billing");
  const attention = useAttentionItems();
  const today = useTodayData({ appointmentsEnabled });
  const prefs = useDashboardPrefs({ appointments: appointmentsEnabled });

  const refresh = () => {
    attention.refresh();
    today.refresh();
  };

  /** Skeleton while loading, an error with "Try again" if it failed, the card once the data is in. */
  const withData = (what: string, skeleton: string, render: (data: TodayData) => ReactNode): ReactNode => {
    if (today.isError) {
      return (
        <div className="rounded-xl border bg-card shadow-sm">
          <CardError what={what} onRetry={refresh} />
        </div>
      );
    }
    if (!today.data) return <Skeleton className={cn("w-full rounded-xl", skeleton)} aria-label={`Loading ${what}`} />;
    return render(today.data);
  };

  const figureItems = ({ figures, revenueSeries }: TodayData): Figure[] => {
    const previousMonth = revenueSeries[revenueSeries.length - 2]?.label ?? "last month";
    return [
      {
        label: "Open projects",
        value: String(figures.openProjects),
        detail: figures.dueToday > 0 ? `${figures.dueToday} due today or late` : "None due today",
        detailTone: figures.dueToday > 0 ? "bad" : "default",
        to: `/${role}/projects?status=open`,
      },
      {
        label: "Intake",
        value: String(figures.intake),
        detail: "Received, evaluating or quoted",
        to: `/${role}/projects?status=intake`,
      },
      ...(canSeeMoney
        ? [
            {
              label: "Awaiting payment",
              value: format(figures.awaitingPayment),
              detail: figures.overdueAmount > 0 ? `${format(figures.overdueAmount)} overdue` : "Nothing overdue",
              detailTone: figures.overdueAmount > 0 ? ("bad" as const) : ("default" as const),
              chart: figures.overdueAmount > 0 ? <MiniSplit part={figures.overdueAmount} whole={figures.awaitingPayment} /> : undefined,
              to: figures.overdueAmount > 0 ? `/${role}/invoices?status=overdue` : `/${role}/invoices`,
            },
          ]
        : []),
      ...(role === "admin" && canSeeMoney
        ? [
            {
              label: `Revenue, ${new Date().toLocaleDateString(undefined, { month: "long" })}`,
              value: format(figures.revenueMonth),
              delta:
                figures.revenueDelta === null
                  ? undefined
                  : {
                      text: `${Math.abs(figures.revenueDelta)}% vs ${previousMonth}`,
                      direction: figures.revenueDelta >= 0 ? ("up" as const) : ("down" as const),
                      tone: figures.revenueDelta >= 0 ? ("good" as const) : ("bad" as const),
                    },
              detail: figures.revenueDelta === null ? `Nothing paid in ${previousMonth} to compare` : undefined,
              chart: <MiniBars values={revenueSeries.map((p) => p.value)} />,
              to: "/reports",
            },
          ]
        : [
            {
              label: "In quality check",
              value: String(figures.inReview),
              detail: figures.inReview > 0 ? "Waiting for sign-off" : "Nothing waiting",
              to: `/${role}/projects?status=review`,
            },
          ]),
      ...(appointmentsEnabled
        ? [
            {
              label: "Appointments today",
              value: String(figures.appointmentsToday),
              detail: figures.appointmentsToday > 0 ? "See today's list below" : "Nothing booked",
              to: `/${role}/calendar`,
            },
          ]
        : []),
    ];
  };

  const renderCard = (id: CardId): ReactNode => {
    switch (id) {
      case "attention":
        return <TodoSummary items={attention.items} isLoading={attention.isLoading} isError={attention.isError} onRetry={refresh} />;
      case "onboarding":
        return <AdminOnboardingChecklist />;
      case "figures":
        return withData("the figures", "h-[132px]", (d) => <Figures items={figureItems(d)} />);
      case "jobs":
        return withData("open projects", "h-64", (d) => <JobsCard jobs={d.openJobs} total={d.figures.openProjects} role={role} />);
      case "efficiency":
        return withData("labour efficiency", "h-32", (d) => (
          <RatioCard
            title="Labour efficiency"
            figure={efficiencyFigure(d.figures.efficiency)}
            pct={d.figures.efficiency.pct}
            how={EFFICIENCY_HOW}
          />
        ));
      case "conversion":
        return withData("quote conversion", "h-32", (d) => (
          <RatioCard
            title="Quote conversion"
            figure={conversionFigure(d.figures.quoteConversion)}
            pct={d.figures.quoteConversion.pct}
            how={CONVERSION_HOW}
          />
        ));
      case "schedule":
        return withData("today's appointments", "h-48", (d) => <ScheduleCard appointments={d.appointments} role={role} />);
      case "team":
        return withData("team load", "h-48", (d) => <TeamCard team={d.teamLoad} role={role} />);
      case "revenue":
        // Money stays hidden from anyone without Billing.
        return canSeeMoney ? withData("revenue", "h-64", (d) => <RevenueCard series={d.revenueSeries} format={format} />) : null;
      case "activity":
        return <ActivityFeed />;
    }
  };

  const visible = prefs.layout.filter((e) => e.visible);

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-1">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Today</h1>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            <Summary items={attention.items} ready={!attention.isLoading && !attention.isError} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={today.isFetching}
            aria-label="Refresh dashboard"
            className="h-10 w-10"
          >
            <RefreshCw className={cn(today.isFetching && "animate-spin")} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-10 px-4">
                <Plus />
                New
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild className="min-h-[44px]">
                <Link to="/reception"><Wrench className="mr-2 h-4 w-4" />Project</Link>
              </DropdownMenuItem>
              {appointmentsEnabled && (
                <DropdownMenuItem asChild className="min-h-[44px]">
                  <Link to={`/${role}/appointments`}><CalendarPlus className="mr-2 h-4 w-4" />Appointment</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="min-h-[44px]">
                <Link to="/invoices/new"><Receipt className="mr-2 h-4 w-4" />Invoice</Link>
              </DropdownMenuItem>
              {role === "admin" && (
                <DropdownMenuItem asChild className="min-h-[44px]">
                  <Link to="/admin/clients"><UserPlus className="mr-2 h-4 w-4" />Client</Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-2">
        {visible.map(({ meta }) => (
          <div key={meta.id} className={cn("min-w-0 empty:hidden", WIDE.has(meta.id) && "lg:col-span-2")}>
            {renderCard(meta.id)}
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <CardCustomiser
          layout={prefs.layout}
          onVisibleChange={prefs.setVisible}
          onMove={prefs.move}
          onReset={prefs.reset}
        />
      </div>
    </div>
  );
}
