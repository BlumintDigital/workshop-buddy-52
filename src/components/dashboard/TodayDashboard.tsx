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
import { AttentionQueue } from "./AttentionQueue";
import { CardCustomiser } from "./CardCustomiser";
import { Figures, type Figure } from "./Figures";
import { PageBar } from "./PageBar";
import { Panel } from "./Panel";
import { JobStatusPill } from "./StatusPill";
import { useAttentionItems } from "@/hooks/useAttentionItems";
import { useCurrency } from "@/hooks/useCurrency";
import { useDashboardPrefs } from "@/hooks/useDashboardPrefs";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useTodayData, type OpenJob, type TeamLoadEntry, type TodayAppointment, type RevenuePoint } from "@/hooks/useTodayData";
import type { CardId } from "@/lib/dashboardCards";
import { todayIso } from "@/lib/dashboardQueries";
import { cn } from "@/lib/utils";

/** Cards that take the full width; the rest pair up two per row on large screens. */
const WIDE: ReadonlySet<CardId> = new Set(["attention", "onboarding", "figures", "jobs", "activity"]);

function formatDue(due: string | null): { text: string; late: boolean } {
  if (!due) return { text: "No due date", late: false };
  const today = todayIso();
  if (due < today) return { text: `Overdue · ${new Date(due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, late: true };
  if (due === today) return { text: "Due today", late: false };
  return { text: new Date(due).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }), late: false };
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-muted-foreground">{children}</p>;
}

function JobsCard({ jobs, role }: { jobs: OpenJob[]; role: "admin" | "manager" }) {
  return (
    <Panel title="Projects in progress" link={{ label: "View all projects", to: `/${role}/projects` }}>
      {jobs.length === 0 ? (
        <EmptyRow>
          No open jobs.{" "}
          <Link to={`/${role}/projects`} className="font-medium text-primary hover:underline">
            Create a job
          </Link>{" "}
          to start tracking work.
        </EmptyRow>
      ) : (
        <ul className="divide-y">
          {jobs.map((job) => {
            const due = formatDue(job.due_date);
            return (
              <li key={job.id}>
                <Link
                  to={`/projects/${job.id}`}
                  className="grid min-h-[56px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 transition-colors hover:bg-secondary/60 sm:grid-cols-[1fr_140px_auto_120px]"
                >
                  <span className="min-w-0 truncate text-sm font-medium"><span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">{job.ref}</span>{job.title}</span>
                  <span className="hidden truncate text-sm text-muted-foreground sm:block">{job.assignee ?? "Unassigned"}</span>
                  <JobStatusPill status={job.status} />
                  <span className={cn("col-span-2 text-xs sm:col-span-1 sm:text-right sm:text-sm", due.late ? "font-medium text-destructive" : "text-muted-foreground")}>
                    <span className="sm:hidden">{job.assignee ?? "Unassigned"} · </span>
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
              <Link to={`/appointments/${a.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-secondary/60">
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
  const useHours = team.some((t) => t.hours > 0);
  const max = Math.max(1, ...team.map((t) => (useHours ? t.hours : t.jobs)));
  return (
    <Panel title="Team load" link={{ label: "View team", to: role === "admin" ? "/admin/users" : "/manager/staff" }}>
      {team.length === 0 ? (
        <EmptyRow>No open projects are assigned yet. Assign projects to see who has capacity.</EmptyRow>
      ) : (
        <ul className="space-y-3 px-4 py-4">
          {team.map((t) => {
            const value = useHours ? t.hours : t.jobs;
            return (
              <li key={t.id} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{t.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(value / max) * 100}%` }} />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {useHours ? `${t.hours.toFixed(1)} h · ` : ""}
                  {t.jobs} {t.jobs === 1 ? "project" : "projects"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
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
              {p.value > 0 ? format(p.value).replace(/\.00$/, "") : "–"}
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

interface TodayDashboardProps {
  role: "admin" | "manager";
}

/** The admin and manager home screen: what needs action first, then the day's work. Cards are user-configurable. */
export function TodayDashboard({ role }: TodayDashboardProps) {
  const appointmentsEnabled = useFeature("appointments");
  const { format } = useCurrency();
  const attention = useAttentionItems();
  const today = useTodayData({ appointmentsEnabled });
  const prefs = useDashboardPrefs({ appointments: appointmentsEnabled });
  const { figures } = today;

  const refresh = () => {
    attention.refresh();
    today.refresh();
  };

  const figureItems: Figure[] = [
    ...(role === "admin"
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
            label: "In review",
            value: String(figures.inReview),
            detail: figures.inReview > 0 ? "Waiting for sign-off" : "Nothing waiting",
            to: `/${role}/projects`,
          },
        ]),
    {
      label: "Open projects",
      value: String(figures.openJobs),
      detail: figures.dueToday > 0 ? `${figures.dueToday} due today or late` : "None due today",
      detailTone: figures.dueToday > 0 ? "bad" : "default",
      to: `/${role}/projects`,
    },
    {
      label: "Awaiting payment",
      value: format(figures.awaitingPayment),
      detail: figures.overdueAmount > 0 ? `${format(figures.overdueAmount)} overdue` : "Nothing overdue",
      detailTone: figures.overdueAmount > 0 ? "bad" : "default",
      to: `/${role}/invoices`,
    },
    appointmentsEnabled
      ? {
          label: "Appointments today",
          value: String(figures.appointmentsToday),
          detail: figures.appointmentsToday > 0 ? "See today's list below" : "Nothing booked",
          to: `/${role}/calendar`,
        }
      : {
          label: "Open project hours",
          value: `${today.teamLoad.reduce((s, t) => s + t.hours, 0).toFixed(1)} h`,
          detail: "Estimated, across the team",
          to: `/${role}/projects`,
        },
  ];

  const renderCard = (id: CardId): ReactNode => {
    switch (id) {
      case "attention":
        return <AttentionQueue items={attention.items} isLoading={attention.isLoading} />;
      case "onboarding":
        return <AdminOnboardingChecklist />;
      case "figures":
        return today.isLoading ? <Skeleton className="h-[88px] w-full rounded-lg" /> : <Figures items={figureItems} />;
      case "jobs":
        return today.isLoading ? <Skeleton className="h-64 w-full rounded-lg" /> : <JobsCard jobs={today.openJobs} role={role} />;
      case "schedule":
        return today.isLoading ? <Skeleton className="h-48 w-full rounded-lg" /> : <ScheduleCard appointments={today.appointments} role={role} />;
      case "team":
        return today.isLoading ? <Skeleton className="h-48 w-full rounded-lg" /> : <TeamCard team={today.teamLoad} role={role} />;
      case "revenue":
        return today.isLoading ? <Skeleton className="h-48 w-full rounded-lg" /> : <RevenueCard series={today.revenueSeries} format={format} />;
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
              disabled={today.isLoading}
              aria-label="Refresh dashboard"
              className="h-10 w-10"
            >
              <RefreshCw className={cn(today.isLoading && "animate-spin")} />
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
