import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  layoutToPrefs,
  moveCard,
  resolveLayout,
  setCardVisible,
  type CardId,
  type DashboardPrefs,
  type LayoutEntry,
} from "@/lib/dashboardCards";

const localKey = (userId: string) => `dashboard-prefs:${userId}`;

function readLocal(userId: string): DashboardPrefs | null {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? (JSON.parse(raw) as DashboardPrefs) : null;
  } catch {
    return null;
  }
}

function writeLocal(userId: string, prefs: DashboardPrefs | null) {
  try {
    if (prefs) localStorage.setItem(localKey(userId), JSON.stringify(prefs));
    else localStorage.removeItem(localKey(userId));
  } catch {
    // Storage can be unavailable (private mode); the layout still works for this session.
  }
}

/**
 * The signed-in user's dashboard card layout. Saved to `dashboard_prefs` so it
 * follows them across devices; mirrored to localStorage so the dashboard
 * renders in the right order immediately and still works if the table is missing.
 */
export function useDashboardPrefs({ appointments }: { appointments: boolean }) {
  const { user, role } = useAuth();
  const [prefs, setPrefs] = useState<DashboardPrefs | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setPrefs(readLocal(user.id));

    supabase
      .from("dashboard_prefs")
      .select("card_order, hidden")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          const remote = { order: data.card_order ?? [], hidden: data.hidden ?? [] };
          setPrefs(remote);
          writeLocal(user.id, remote);
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const layout = useMemo(
    () => (role ? resolveLayout(role, prefs, { appointments }) : []),
    [role, prefs, appointments],
  );

  const persist = useCallback(
    (next: DashboardPrefs | null) => {
      if (!user) return;
      setPrefs(next);
      writeLocal(user.id, next);
      const request = next
        ? supabase.from("dashboard_prefs").upsert({
            user_id: user.id,
            card_order: next.order,
            hidden: next.hidden,
            updated_at: new Date().toISOString(),
          })
        : supabase.from("dashboard_prefs").delete().eq("user_id", user.id);
      // Local copy already applied; a failed sync only loses cross-device sharing.
      request.then(({ error }) => {
        if (error) console.warn("Dashboard layout not synced:", error.message);
      });
    },
    [user],
  );

  const update = useCallback(
    (fn: (current: LayoutEntry[]) => LayoutEntry[]) => persist(layoutToPrefs(fn(layout))),
    [layout, persist],
  );

  return {
    layout,
    isLoading,
    setVisible: (id: CardId, visible: boolean) => update((l) => setCardVisible(l, id, visible)),
    move: (id: CardId, direction: -1 | 1) => update((l) => moveCard(l, id, direction)),
    reset: () => persist(null),
  };
}
