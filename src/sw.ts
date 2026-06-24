/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Page navigations are network-only so authenticated screens are never stored.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkOnly(),
);

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
