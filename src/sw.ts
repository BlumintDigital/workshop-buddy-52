/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();

// Registered BEFORE precacheAndRoute so it takes priority — navigation requests
// always go to the network, preventing stale index.html from being served after deployments.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkOnly(),
);

precacheAndRoute(self.__WB_MANIFEST);

setCatchHandler(async ({ request }) => {
  if (request.mode === "navigate") {
    const offlinePage = await caches.match("/offline.html", {
      ignoreSearch: true,
    });
    if (offlinePage) return offlinePage;
  }

  return Response.error();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Notification", {
      body: data.body ?? "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    (self as unknown as { clients: Clients }).clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const existing = (list as WindowClient[]).find((c) => c.url === target && "focus" in c);
        if (existing) return existing.focus();
        return (self as unknown as { clients: Clients }).clients.openWindow(target);
      })
  );
});
