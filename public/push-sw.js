// Self-destructing legacy push service worker.
// Push handlers were merged into the main Workbox worker (/sw.js).
// This stub unregisters any existing /push-sw.js registration on activate
// so returning browsers don't keep a stale worker around.

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.clients.claim();
      } finally {
        await self.registration.unregister();
      }
    })()
  );
});
