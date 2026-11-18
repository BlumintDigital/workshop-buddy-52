import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ChevronDown, Plus, Receipt, RefreshCw, UserPlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Figures, type Figure } from "./Figures";
import { PageBar } from "./PageBar";
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
import { conversionFigure, efficiencyFigure, plural, type RatioFigure } from "@/lib/dashboardTodo";
import { cn } from "@/lib/utils";

/** Cards that take the full width; the rest pair up two per row on large screens. */
const WIDE: ReadonlySet<CardId> = new Set(["attention", "onboarding", "figures", "jobs", "activity"]);

function formatDue(due: string | null): { text: string; late: boolean } {
  if (!due) return { text: "No due date", late: false };
  const today = todayIso();
  if (due < today) return { text: `Late · ${new Date(due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, late: true };
  if (due === today) return { text: "Due today", late: false };
  return { text: new Date(due).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), late: false };
}

const hours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-muted-foreground">{children}</p>;
}

function JobsCard({ jobs, role }: { jobs: OpenJob[]; role: "admin" | "manager" }) {
  return (
    <Panel title="Projects in progress" link={{ label: "View all projects", to: `/${role}/projects?status=open` }}>
      {jobs.length === 0 ? (
        <EmptyRow>
          No open projects.{" "}
          <Link to="/reception" className="font-medium text-primary underline-offset-4 hover:underline">
            Start one at Reception
          </Link>{" "}
          when work comes in.
        </EmptyRow>
      ) : (
        <ul className="divide-y">
          {jobs.map((job) => {
            const due = formatDue(job.due_date);
            return (
              <li key={job.id}>
                <Link
                  to={`/projects/${job.id}`}
                  className="grid min-h-[56px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1fr_140px_auto_120px]"
                >
                  <span className="min-w-0 truncate text-sm font-medium"><span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">{job.ref}</span>{job.title}</span>
                  <span className="hidden truncate text-sm text-muted-foreground sm:block">{job.assignee ?? "No lead"}</span>
                  <JobStatusPill status={job.status} />
                  <span className={cn("col-span-2 text-xs sm:col-span-1 sm:text-right sm:text-sm", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>
                    <span className="sm:hidden">{job.assignee ?? "No lead"} · </span>
                    {due.text}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ScheduleCard({ appointments, role }: { appointments: TodayAppointment[]; role: "admin" | "manager" }) {
  return (
    <Panel title="Today's appointments" link={{ label: "Open calendar", to: `/${role}/calendar` }}>
      {appointments.length === 0 ? (
        <EmptyRow>Nothing booked for today.</EmptyRow>
      ) : (
        <ul className="divide-y">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link to={`/appointments/${a.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/60">
                <span className="w-12 shrink-0 text-sm tabular-nums text-muted-foreground">{(a.appointment_time || "").slice(0, 5)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title || "Appointment"}</span>
                {a.duration_minutes ? <span className="text-xs text-muted-foreground">{a.duration_minutes} min</span> : null}
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
    <Panel title="Team load" link={{ label: "View team", to: role === "admin" ? "/admin/users" : "/manager/staff" }}>
      {team.length === 0 ? (
        <EmptyRow>No hours logged this week and no open tasks assigned. Assign tasks on a project to see who has capacity.</EmptyRow>
      ) : (
        <>
          <p className="px-4 pt-3 text-xs text-muted-foreground">Hours logged this week, and open tasks assigned</p>
          <ul className="space-y-3 px-4 pb-4 pt-3">
            {team.map((t) => (
              <li key={t.id} className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,8rem)_1fr_auto]">
                <span className="truncate">{t.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(t.logged_hours / max) * 100}%` }} />
                </span>
                <span className="col-span-2 tabular-nums text-muted-foreground sm:col-span-1 sm:text-right">
                  {hours(t.logged_hours)} h · {t.tasks} open {plural(t.tasks, "task", "tasks")}
                  {t.remaining_hours > 0 ? ` (${hours(t.remaining_hours)} h left)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function RatioCard({ title, figure, how }: { title: string; figure: RatioFigure; how: string }) {
  return (
    <Panel title={title} className="flex h-full flex-col">
      <div className="flex-1 space-y-1 px-4 py-4">
        {figure.value ? (
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{figure.value}</p>
        ) : (
          <p className="text-base font-medium">Not enough data yet</p>
        )}
        <p className="text-sm text-muted-foreground">{figure.detail}</p>
      </div>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">{how}</p>
    </Panel>
  );
}

function RevenueCard({ series, format }: { series: RevenuePoint[]; format: (n: number) => string }) {
  const max = Math.max(1, ...series.map((p) => p.value));
  const last = series.length - 1;
  return (
    <Panel title="Revenue trend" link={{ label: "View reports", to: "/reports" }}>
      <p className="px-4 pt-3 text-xs text-muted-foreground">Paid invoices by month paid</p>
      <ol className="grid h-44 grid-cols-6 items-end gap-2 px-4 pb-3 pt-2" aria-label="Paid revenue for the last 6 months">
        {series.map((p, i) => (
          <li key={p.label} className="flex h-full flex-col items-center justify-end gap-1">
            <span className={cn("text-xs tabular-nums", i === last ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {p.value > 0 ? format(p.value).replace(/\.00$/, "") : "None"}
            </span>
            <span
              className={cn("w-full rounded-t-sm", i === last ? "bg-primary" : "bg-primary/35")}
              style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
            />
            <span className="text-xs text-muted-foreground">{p.label}</span>
          </li>
        ))}
      </ol>
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
        <div className="rounded-lg border bg-card">
          <CardError what={what} onRetry={refresh} />
        </div>
      );
    }
    if (!today.data) return <Skeleton className={cn("w-full rounded-lg", skeleton)} aria-label={`Loading ${what}`} />;
    return render(today.data);
  };

  const figureItems = ({ figures }: TodayData): Figure[] => [
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
            to: figures.overdueAmount > 0 ? `/${role}/invoices?status=overdue` : `/${role}/invoices`,
          },
        ]
      : []),
    ...(role === "admin" && canSeeMoney
      ? [
          {
            label: `Revenue, ${new Date().toLocaleDateString(undefined, { month: "long" })}`,
            value: format(figures.revenueMonth),
            detail:
              figures.revenueDelta === null
                ? "Nothing paid last month to compare"
                : `${figures.revenueDelta >= 0 ? "Up" : "Down"} ${Math.abs(figures.revenueDelta)}% on last month`,
            detailTone: figures.revenueDelta === null ? ("default" as const) : figures.revenueDelta >= 0 ? ("good" as const) : ("bad" as const),
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

  const renderCard = (id: CardId): ReactNode => {
    switch (id) {
      case "attention":
        return <TodoSummary items={attention.items} isLoading={attention.isLoading} isError={attention.isError} onRetry={refresh} />;
      case "onboarding":
        return <AdminOnboardingChecklist />;
      case "figures":
        return withData("the figures", "h-[96px]", (d) => <Figures items={figureItems(d)} />);
      case "jobs":
        return withData("open projects", "h-64", (d) => <JobsCard jobs={d.openJobs} role={role} />);
      case "efficiency":
        return withData("labour efficiency", "h-44", (d) => (
          <RatioCard title="Labour efficiency" figure={efficiencyFigure(d.figures.efficiency)} how={EFFICIENCY_HOW} />
        ));
      case "conversion":
        return withData("quote conversion", "h-44", (d) => (
          <RatioCard title="Quote conversion" figure={conversionFigure(d.figures.quoteConversion)} how={CONVERSION_HOW} />
        ));
      case "schedule":
        return withData("today's appointments", "h-48", (d) => <ScheduleCard appointments={d.appointments} role={role} />);
      case "team":
        return withData("team load", "h-48", (d) => <TeamCard team={d.teamLoad} role={role} />);
      case "revenue":
        // Money stays hidden from anyone without Billing.
        return canSeeMoney ? withData("revenue", "h-48", (d) => <RevenueCard series={d.revenueSeries} format={format} />) : null;
      case "activity":
        return <ActivityFeed />;
    }
  };

  const visible = prefs.layout.filter((e) => e.visible);

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-4">
      <PageBar
        title="Today"
        subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <>
            <Button
              variant="ghost"
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
                <Button size="sm" className="h-10">
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
          </>
        }
      />

      <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-2">
        {visible.map(({ meta }) => (
          <div key={meta.id} className={cn("min-w-0 empty:hidden", WIDE.has(meta.id) && "lg:col-span-2")}>
            {renderCard(meta.id)}
          </div>
        ))}
      </div>

      <div className="flex justify-center pt-2">
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
