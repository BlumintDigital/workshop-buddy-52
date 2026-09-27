import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchProfileNames } from "@/lib/profileNames";
import { projectStatusLabel } from "@/lib/projects";
import { cn } from "@/lib/utils";

type EventRow = {
  id: number;
  kind: string;
  actor_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** One line per event. Unknown kinds still render, so new event types never break the page. */
function describe(e: EventRow, names: Record<string, string>): { label: string; sub?: string; tone: "status" | "people" | "neutral" | "good" | "warn" } {
  const d = e.data ?? {};
  const who = (id: unknown) => (str(id) ? names[id as string] || "someone" : null);
  switch (e.kind) {
    case "created":
      return { label: "Project received", tone: "neutral" };
    case "status":
      return { label: projectStatusLabel(str(d.to)), sub: str(d.from) ? `from ${projectStatusLabel(str(d.from))}` : undefined, tone: "status" };
    case "assigned": {
      const to = who(d.to);
      const from = who(d.from);
      if (to && from) return { label: `Reassigned to ${to}`, sub: `from ${from}`, tone: "people" };
      if (to) return { label: `Assigned to ${to}`, tone: "people" };
      return { label: "Unassigned", sub: from ? `was ${from}` : undefined, tone: "people" };
    }
    case "handoff":
      return { label: `Handed off: ${str(d.task) ?? "task"}`, sub: str(d.next) ? `next: ${d.next}` : undefined, tone: "good" };
    case "task_returned":
      return { label: `Sent back for rework: ${str(d.task) ?? "task"}`, sub: str(d.reason) ?? undefined, tone: "warn" };
    case "parts_requested":
      return { label: "Parts requested", sub: str(d.summary) ?? undefined, tone: "neutral" };
    case "parts_issued":
      return { label: "Parts issued", sub: str(d.summary) ?? undefined, tone: "neutral" };
    case "quote_sent":
      return { label: `${str(d.label) ?? "Quote"} sent to client`, sub: str(d.total) ?? undefined, tone: "status" };
    case "quote_accepted":
      return { label: `${str(d.label) ?? "Quote"} accepted by client`, tone: "good" };
    case "quote_declined":
      return { label: `${str(d.label) ?? "Quote"} declined by client`, sub: str(d.reason) ?? undefined, tone: "warn" };
    case "change_request":
      return { label: `Change request ${str(d.label) ?? ""} ${str(d.action) ?? "updated"}`.trim(), tone: "neutral" };
    case "qc_passed":
      return { label: "Passed quality check", tone: "good" };
    case "shipment_notified":
      return { label: "Client told it's ready", tone: "neutral" };
    case "handover_chosen":
      return { label: `Client chose ${d.method === "courier" ? "courier delivery" : "pickup"}`, tone: "neutral" };
    case "shipped":
      return { label: d.method === "courier" ? "Shipped by courier" : "Collected by client", sub: str(d.detail) ?? undefined, tone: "good" };
    case "unpaid_handover":
      return { label: "Handed over before payment", sub: str(d.reason) ?? undefined, tone: "warn" };
    default:
      return { label: e.kind.replace(/_/g, " "), tone: "neutral" };
  }
}

const DOT: Record<string, string> = {
  status: "border-primary bg-primary",
  people: "border-info bg-info",
  good: "border-success bg-success",
  warn: "border-warning bg-warning",
  neutral: "border-muted-foreground bg-muted",
};

function duration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
  return mins % 60 ? `${h}h ${mins % 60}m` : `${h}h`;
}

/**
 * Everything that happened to the project, in order: stage changes, assignments,
 * handoffs, parts, quotes and shipping. Written by the database, so it can't be
 * edited or forgotten. Team members only; clients see the stage tracker instead.
 */
export default function ProjectActivity({ jobId, createdAt, refreshKey }: { jobId: string; createdAt: string; refreshKey?: unknown }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("project_events")
        .select("id, kind, actor_id, data, created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      const rows = (data ?? []) as EventRow[];
      const ids = rows.flatMap((r) => [r.actor_id, str(r.data?.to), str(r.data?.from)]);
      const n = await fetchProfileNames(ids, "");
      if (!cancelled) {
        setEvents(rows);
        setNames(n);
        setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel(`project-events-${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "project_events", filter: `job_id=eq.${jobId}` }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [jobId, refreshKey]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" aria-hidden />
          Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <>
            <ol>
              {events.map((e, i) => {
                const { label, sub, tone } = describe(e, names);
                const at = new Date(e.created_at);
                const gap = i > 0 ? at.getTime() - new Date(events[i - 1].created_at).getTime() : null;
                return (
                  <li key={e.id} className="relative flex gap-3">
                    {i < events.length - 1 && <span aria-hidden className="absolute bottom-0 left-[5px] top-4 w-px bg-border" />}
                    <span aria-hidden className={cn("relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2", DOT[tone])} />
                    <div className="min-w-0 flex-1 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium leading-tight">{label}</span>
                        {gap !== null && <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">+{duration(gap)}</span>}
                      </div>
                      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <time dateTime={e.created_at}>
                          {at.toLocaleDateString(undefined, { day: "numeric", month: "short" })} ·{" "}
                          {at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </time>
                        {e.actor_id && names[e.actor_id] && ` · ${names[e.actor_id]}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="flex items-center justify-between border-t pt-2 text-xs">
              <span className="text-muted-foreground">Open for</span>
              <span className="font-semibold tabular-nums">{duration(Date.now() - new Date(createdAt).getTime())}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
