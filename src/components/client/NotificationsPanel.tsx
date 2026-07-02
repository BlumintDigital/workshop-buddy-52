import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, link, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!active) return;
      setItems((data as Notification[]) || []);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`client-notifs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (p) => {
        setItems((prev) => [p.new as Notification, ...prev].slice(0, 10));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (p) => {
        const u = p.new as Notification;
        setItems((prev) => prev.map((n) => (n.id === u.id ? { ...n, ...u } : n)));
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unread = items.filter((n) => !n.read).length;

  const markOne = async (n: Notification) => {
    if (n.read) return;
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  };

  const markAll = async () => {
    if (!user || unread === 0) return;
    const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    if (error) { toast.error("Couldn't mark notifications as read"); return; }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <Card tone="default" className="col-span-2 lg:col-span-12">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">Updates</p>
            <h3 className="mt-1 flex items-center gap-2 text-display text-2xl">
              <Bell className="h-5 w-5 text-primary" /> Notifications
              {unread > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  {unread} new
                </span>
              )}
            </h3>
          </div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll} className="shrink-0">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Bell className="h-6 w-6 text-primary/60" />
              You're all caught up — no notifications yet.
            </div>
          ) : (
            items.map((n) => {
              const inner = (
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.read ? "bg-muted-foreground/30" : "bg-primary",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", n.read ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>
                      {n.title}
                    </p>
                    {n.message && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              );
              const cls = cn(
                "block rounded-xl px-3 py-3 min-h-[56px] transition-colors",
                n.read ? "hover:bg-secondary/60" : "bg-tile-sage/40 hover:bg-tile-sage/60",
              );
              return n.link ? (
                <Link key={n.id} to={n.link} onClick={() => markOne(n)} className={cls}>
                  {inner}
                </Link>
              ) : (
                <button key={n.id} onClick={() => markOne(n)} className={cn(cls, "w-full text-left")}>
                  {inner}
                </button>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
