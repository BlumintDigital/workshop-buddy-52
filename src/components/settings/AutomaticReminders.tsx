import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { useAuth } from "@/hooks/useAuth";
import { friendlyErrorMessage } from "@/lib/friendlyError";
import { relativeTime } from "@/lib/profileNames";

// shortcut: the new tables aren't in the generated types yet; regenerate types.ts to drop this.
const db = supabase as any;

type RecipeId = "quote_reminder" | "invoice_overdue" | "collection_reminder";
interface Recipe { recipe: RecipeId; enabled: boolean; days: number[] }
interface Run { id: string; recipe: RecipeId; step: number; status: "pending" | "sent" | "failed" | "skipped"; label: string | null; error: string | null; created_at: string }

const RECIPES: { id: RecipeId; title: string; help: string; option: string; many?: boolean }[] = [
  {
    id: "quote_reminder",
    title: "Quote reminders",
    help: "Email the client when a quote they were sent hasn't been accepted or declined. Up to 2 reminders.",
    option: "Remind after (days)",
  },
  {
    id: "invoice_overdue",
    title: "Overdue invoice reminders",
    help: "Email the client when an invoice is past its due date. Work is never paused or stopped automatically; that stays your decision.",
    option: "Days after the due date (for example 7, 21)",
    many: true,
  },
  {
    id: "collection_reminder",
    title: "Collection reminders",
    help: "Email the client when their item is ready but collection or delivery hasn't been arranged. Up to 2 reminders.",
    option: "Remind after (days)",
  },
];
const TITLE = Object.fromEntries(RECIPES.map((r) => [r.id, r.title])) as Record<RecipeId, string>;
const STATUS: Record<Run["status"], { tone: StatusTone; label: string }> = {
  pending: { tone: "info", label: "Sending" },
  sent: { tone: "success", label: "Sent" },
  failed: { tone: "danger", label: "Failed" },
  skipped: { tone: "neutral", label: "Not sent" },
};

/** Settings > Notifications: the automatic reminder switches, recent runs and failed sends. Admins only. */
export default function AutomaticReminders() {
  const { role } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [failed, setFailed] = useState(0);

  const load = useCallback(async () => {
    const [r, x, f] = await Promise.all([
      db.from("automation_recipes").select("recipe, enabled, days"),
      db.from("automation_runs").select("id, recipe, step, status, label, error, created_at").order("created_at", { ascending: false }).limit(20),
      db.from("automation_runs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    setRecipes(r.data ?? []);
    setDrafts(Object.fromEntries((r.data ?? []).map((x: Recipe) => [x.recipe, x.days.join(", ")])));
    setRuns(x.data ?? []);
    setFailed(f.count ?? 0);
  }, []);
  useEffect(() => { if (role === "admin") load(); }, [role, load]);

  if (role !== "admin") return null;

  const save = async (id: RecipeId, enabled: boolean) => {
    const days = (drafts[id] ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
    const { error } = await db.rpc("set_automation_recipe", { _recipe: id, _enabled: enabled, _days: days });
    if (error) toast.error(await friendlyErrorMessage(error, "Couldn't save the reminder"));
    await load();
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Automatic reminders</CardTitle>
        <CardDescription>
          Short, polite emails sent for you. A reminder only covers things that happen after you switch it on, and nothing is sent between 9pm and 8am (UK time).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {RECIPES.map((def) => {
          const r = recipes.find((x) => x.recipe === def.id);
          if (!r) return null;
          return (
            <div key={def.id} className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{def.title}</p>
                  <p className="text-xs text-muted-foreground">{def.help}</p>
                </div>
                <Switch aria-label={def.title} checked={r.enabled} onCheckedChange={(v) => save(def.id, v)} />
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor={`reminder-${def.id}`} className="text-xs text-muted-foreground">{def.option}</Label>
                <Input
                  id={`reminder-${def.id}`}
                  className="h-8 w-28"
                  inputMode={def.many ? "text" : "numeric"}
                  value={drafts[def.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [def.id]: e.target.value }))}
                  onBlur={() => { if (drafts[def.id] !== r.days.join(", ")) save(def.id, r.enabled); }}
                />
              </div>
            </div>
          );
        })}

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">Recent reminders</p>
            <StatusPill tone={failed ? "danger" : "neutral"}>{failed} failed to send</StatusPill>
          </div>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No reminders sent yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{run.label ?? TITLE[run.recipe]}</p>
                    <p className="truncate text-xs text-muted-foreground" title={run.error ?? undefined}>
                      {TITLE[run.recipe]}, reminder {run.step} · {relativeTime(run.created_at)}{run.error ? ` · ${run.error}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={STATUS[run.status].tone}>{STATUS[run.status].label}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
