import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Info, AlertTriangle, AlertOctagon, X } from "lucide-react";

type Severity = "info" | "warning" | "critical";

interface Broadcast {
  id: string;
  title: string;
  message: string | null;
  severity: Severity;
  link_url: string | null;
  link_label: string | null;
  active: boolean;
  starts_at: string;
  expires_at: string | null;
}

const DISMISS_KEY = "dismissed-broadcasts";
const MAX_VISIBLE = 3;

const severityRank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

const severityConfig: Record<Severity, { variant: "default" | "destructive"; className: string; Icon: typeof Info }> = {
  info: {
    variant: "default",
    className: "border-primary/30 bg-primary/5 [&>svg]:text-primary",
    Icon: Info,
  },
  warning: {
    variant: "default",
    className:
      "border-amber-300 bg-amber-50 text-amber-900 [&>svg]:text-amber-600 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200 dark:[&>svg]:text-amber-400",
    Icon: AlertTriangle,
  },
  critical: {
    variant: "destructive",
    className: "bg-destructive/5",
    Icon: AlertOctagon,
  },
};

function isActive(b: Broadcast): boolean {
  if (!b.active) return false;
  const now = Date.now();
  if (new Date(b.starts_at).getTime() > now) return false;
  if (b.expires_at && new Date(b.expires_at).getTime() <= now) return false;
  return true;
}

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function BroadcastBanner() {
  const { user } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("broadcasts" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled) setBroadcasts(((data as unknown) as Broadcast[]) || []);
    };
    load();

    const channel = supabase
      .channel("broadcasts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "broadcasts" },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const visible = useMemo(() => {
    return broadcasts
      .filter(isActive)
      .filter((b) => !dismissed.includes(b.id))
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, MAX_VISIBLE);
  }, [broadcasts, dismissed]);

  const dismiss = (id: string) => {
    const next = Array.from(new Set([...dismissed, id]));
    setDismissed(next);
    writeDismissed(next);
  };

  if (!user || visible.length === 0) return null;

  return (
    <div className="flex flex-col">
      {visible.map((b) => {
        const styles = severityStyles[b.severity];
        const isExternal = b.link_url && /^https?:\/\//i.test(b.link_url);
        return (
          <div
            key={b.id}
            role="status"
            className={`${styles.wrap} px-4 py-2.5 flex items-start sm:items-center justify-between gap-3 flex-wrap`}
          >
            <div className="flex items-start sm:items-center gap-2 text-sm min-w-0">
              {styles.icon}
              <div className="min-w-0">
                <span className="font-semibold">{b.title}</span>
                {b.message && <span className="ml-2 opacity-90">{b.message}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {b.link_url && b.link_label && (
                isExternal ? (
                  <a href={b.link_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className={`${styles.btn} min-h-[44px] sm:min-h-0`}>
                      {b.link_label}
                    </Button>
                  </a>
                ) : (
                  <Link to={b.link_url}>
                    <Button size="sm" variant="outline" className={`${styles.btn} min-h-[44px] sm:min-h-0`}>
                      {b.link_label}
                    </Button>
                  </Link>
                )
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss broadcast"
                onClick={() => dismiss(b.id)}
                className="h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
