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

export function BroadcastBanner() {
  const { user } = useAuth();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

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

    const loadDismissed = async () => {
      const { data } = await (supabase.from("dismissed_broadcasts" as any))
        .select("broadcast_id")
        .eq("user_id", user.id);
      if (!cancelled && data) {
        setDismissed(new Set((data as { broadcast_id: string }[]).map((r) => r.broadcast_id)));
      }
    };
    loadDismissed();

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
      .filter((b) => !dismissed.has(b.id))
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, MAX_VISIBLE);
  }, [broadcasts, dismissed]);

  const dismiss = (id: string) => {
    // Optimistic update
    setDismissed((prev) => new Set([...prev, id]));
    if (user) {
      (supabase.from("dismissed_broadcasts" as any)).insert({
        user_id: user.id,
        broadcast_id: id,
      });
    }
  };

  if (!user || visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-3 sm:px-6 pt-3">
      {visible.map((b) => {
        const cfg = severityConfig[b.severity];
        const Icon = cfg.Icon;
        const isExternal = b.link_url && /^https?:\/\//i.test(b.link_url);
        return (
          <Alert key={b.id} variant={cfg.variant} className={`${cfg.className} pr-12`}>
            <Icon className="h-4 w-4" />
            <AlertTitle>{b.title}</AlertTitle>
            {b.message && <AlertDescription>{b.message}</AlertDescription>}
            {b.link_url && b.link_label && (
              <div className="mt-3">
                {isExternal ? (
                  <a href={b.link_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">{b.link_label}</Button>
                  </a>
                ) : (
                  <Link to={b.link_url}>
                    <Button size="sm" variant="outline">{b.link_label}</Button>
                  </Link>
                )}
              </div>
            )}
            <button
              type="button"
              aria-label="Dismiss broadcast"
              onClick={() => dismiss(b.id)}
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md opacity-90 hover:opacity-100 hover:bg-foreground/10 transition-opacity"
            >
              <X className="h-4 w-4 text-current" />
            </button>
          </Alert>
        );
      })}
    </div>
  );
}
