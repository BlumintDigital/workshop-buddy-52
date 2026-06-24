import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    void register();
  }, [user?.id]);

  async function register() {
    try {
      const { data: ws } = await supabase
        .from("workshop_settings")
        .select("vapid_public_key")
        .eq("id", 1)
        .maybeSingle();

      const vapidPublicKey = (ws as any)?.vapid_public_key as string | null;
      if (!vapidPublicKey) return; // VAPID not configured yet — skip silently

      if (Notification.permission === "denied") return;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await save(existing);
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await save(subscription);
    } catch {
      // Push is non-critical — fail silently
    }
  }

  async function save(sub: PushSubscription) {
    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return;

    await supabase.from("push_subscriptions" as any).upsert(
      {
        user_id: user!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth_key: keys.auth,
      },
      { onConflict: "user_id,endpoint" }
    );
  }
}
