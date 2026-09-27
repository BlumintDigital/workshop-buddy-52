import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { NoticeBanner, type NoticeTone } from "@/components/NoticeBanner";

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

const severityTone: Record<Severity, NoticeTone> = { info: "info", warning: "warning", critical: "danger" };

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
        setDismissed(new Set((data as unknown as { broadcast_id: string }[]).map((r) => r.broadcast_id)));
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
    const interval = window.setInterval(load, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
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

  const dismiss = async (id: string) => {
    if (!user) return;
    // Optimistic update
    setDismissed((prev) => new Set([...prev, id]));
    const { error } = await (supabase.from("dismissed_broadcasts" as any)).insert({
      user_id: user.id,
      broadcast_id: id,
    });
    if (error) {
      // Rollback
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error("Could not dismiss broadcast. Please try again.");
    }
  };

  if (!user || visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-3 pt-3 sm:px-6">
      {visible.map((b) => (
        <NoticeBanner
          key={b.id}
          tone={severityTone[b.severity]}
          title={b.title}
          message={b.message}
          action={b.link_url && b.link_label ? { label: b.link_label, href: b.link_url } : undefined}
          onDismiss={() => void dismiss(b.id)}
          dismissLabel="Dismiss announcement"
        />
      ))}
    </div>
  );
}
