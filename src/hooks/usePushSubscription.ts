import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Push notifications now ride on the main Workbox-generated SW at /sw.js.
// The legacy /push-sw.js worker is shipped as a self-unregistering stub.
const SW_PATH = "/sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  loading: boolean;
  vapidConfigured: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  error: string | null;
}

async function getOrRegisterWorker(): Promise<ServiceWorkerRegistration> {
  // Prefer the already-registered Workbox SW. Fall back to ready() to wait
  // for the VitePWA registration that PwaStatus kicked off at boot.
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return await navigator.serviceWorker.ready;
}

export function usePushSubscription(): PushState {
  const { user } = useAuth();
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported"
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!supported || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: ws } = await supabase
        .from("workshop_settings")
        .select("vapid_public_key")
        .eq("id", 1)
        .maybeSingle();
      const key = (ws as any)?.vapid_public_key as string | null;
      setVapidKey(key || null);

      setPermission(Notification.permission);

      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setIsSubscribed(!!sub);
    } finally {
      setLoading(false);
    }
  }, [supported, user]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError("Push notifications aren't supported in this browser.");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    if (!vapidKey) {
      setError("Push notifications haven't been configured for this workshop yet.");
      return;
    }
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Notifications are blocked. Enable them in your browser settings."
            : "Notification permission was not granted."
        );
        return;
      }

      const reg = await getOrRegisterWorker();
      // Wait for the worker to be active.
      if (!reg.active) {
        await new Promise<void>((resolve) => {
          const worker = reg.installing || reg.waiting;
          if (!worker) return resolve();
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
          });
        });
      }

      const existing = await reg.pushManager.getSubscription();
      const subscription =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const keys = json.keys as { p256dh?: string; auth?: string } | undefined;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new Error("Subscription is missing required keys.");
      }

      const { error: upsertErr } = await supabase.from("push_subscriptions" as any).upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth_key: keys.auth,
        },
        { onConflict: "user_id,endpoint" }
      );
      if (upsertErr) throw upsertErr;

      setIsSubscribed(true);
    } catch (e: any) {
      setError(e?.message || "Failed to subscribe to push notifications.");
    } finally {
      setLoading(false);
    }
  }, [supported, user, vapidKey]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    if (!supported || !user) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint;

      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {}
      }

      if (endpoint) {
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", endpoint);
      } else {
        // Fallback: remove any rows for this user
        await supabase.from("push_subscriptions" as any).delete().eq("user_id", user.id);
      }

      setIsSubscribed(false);
    } catch (e: any) {
      setError(e?.message || "Failed to unsubscribe.");
    } finally {
      setLoading(false);
    }
  }, [supported, user]);

  return {
    supported,
    permission,
    isSubscribed,
    loading,
    vapidConfigured: !!vapidKey,
    subscribe,
    unsubscribe,
    error,
  };
}
