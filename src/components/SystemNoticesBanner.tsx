import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell } from "lucide-react";
import { NoticeBanner } from "@/components/NoticeBanner";

interface SystemNotice {
  id: string;
  title: string;
  message: string | null;
  url: string | null;
  user_id: string | null;
  created_at: string;
  expires_at: string | null;
}

const MAX_VISIBLE = 5;

function isActive(n: SystemNotice): boolean {
  if (!n.expires_at) return true;
  return new Date(n.expires_at).getTime() > Date.now();
}

export function SystemNoticesBanner() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("system_notices" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) setNotices(((data as unknown) as SystemNotice[]) || []);
    };
    load();

    const loadDismissed = async () => {
      const { data } = await (supabase.from("dismissed_notices" as any))
        .select("notice_id")
        .eq("user_id", user.id);
      if (!cancelled && data) {
        setDismissed(new Set((data as unknown as { notice_id: string }[]).map((r) => r.notice_id)));
      }
    };
    loadDismissed();

    const channel = supabase
      .channel("system_notices")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_notices" },
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
    return notices
      .filter(isActive)
      .filter((n) => !dismissed.has(n.id))
      .slice(0, MAX_VISIBLE);
  }, [notices, dismissed]);

  const dismiss = async (id: string) => {
    if (!user) return;
    // Optimistic update
    setDismissed((prev) => new Set([...prev, id]));
    const { error } = await (supabase.from("dismissed_notices" as any)).insert({
      user_id: user.id,
      notice_id: id,
    });
    if (error) {
      // Rollback
      setDismissed((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error("Could not dismiss notice. Please try again.");
    }
  };

  if (!user || visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-3 pt-3 sm:px-6">
      {visible.map((n) => (
        <NoticeBanner
          key={n.id}
          tone="info"
          icon={Bell}
          title={n.title}
          message={n.message}
          action={n.url ? { label: "Open", href: n.url } : undefined}
          onDismiss={() => void dismiss(n.id)}
          dismissLabel="Dismiss notice"
        />
      ))}
    </div>
  );
}
