import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bell, X } from "lucide-react";

interface SystemNotice {
  id: string;
  title: string;
  message: string | null;
  url: string | null;
  user_id: string | null;
  created_at: string;
  expires_at: string | null;
}

const DISMISS_KEY = "dismissed-system-notices";
const MAX_VISIBLE = 5;

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

function isActive(n: SystemNotice): boolean {
  if (!n.expires_at) return true;
  return new Date(n.expires_at).getTime() > Date.now();
}

export function SystemNoticesBanner() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed());

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

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const visible = useMemo(() => {
    return notices
      .filter(isActive)
      .filter((n) => !dismissed.includes(n.id))
      .slice(0, MAX_VISIBLE);
  }, [notices, dismissed]);

  const dismiss = (id: string) => {
    const next = Array.from(new Set([...dismissed, id]));
    setDismissed(next);
    writeDismissed(next);
  };

  if (!user || visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-3 sm:px-6 pt-3">
      {visible.map((n) => {
        const isExternal = n.url && /^https?:\/\//i.test(n.url);
        return (
          <Alert
            key={n.id}
            className="border-primary/30 bg-primary/5 [&>svg]:text-primary pr-12"
          >
            <Bell className="h-4 w-4" />
            <AlertTitle>{n.title}</AlertTitle>
            {(n.message || n.url) && (
              <AlertDescription>
                {n.message}
                {n.url && (
                  <>
                    {n.message ? " " : ""}
                    {isExternal ? (
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        Open
                      </a>
                    ) : (
                      <a href={n.url} className="underline font-medium">
                        Open
                      </a>
                    )}
                  </>
                )}
              </AlertDescription>
            )}
            <button
              type="button"
              aria-label="Dismiss notice"
              onClick={() => dismiss(n.id)}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md opacity-70 hover:opacity-100 hover:bg-foreground/10 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </Alert>
        );
      })}
    </div>
  );
}
