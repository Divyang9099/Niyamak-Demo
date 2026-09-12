import { clientsClaim } from 'workbox-core';
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import {
  NetworkFirst,
  NetworkOnly,
  CacheFirst,
  StaleWhileRevalidate,
} from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// ── Lifecycle ────────────────────────────────────────────────────────────────
// Don't call skipWaiting() here unconditionally — the React UI sends a message
// after the user clicks "Refresh", giving them a chance to save work first.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

clientsClaim();

// ── Precache (injected by vite-plugin-pwa at build time) ────────────────────
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── SPA navigation fallback ──────────────────────────────────────────────────
// All browser navigation requests that don't match a precached file are served
// the cached index.html (React app handles routing client-side).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [
      /^\/api\//,          // never intercept backend API paths
      /^\/super-admin/,    // super-admin has its own gate
      /\.[a-z]{2,5}$/i,   // any file with an extension (real assets)
    ],
  })
);

// ── Background sync — queues mutating API calls when offline ─────────────────
const bgSync = new BackgroundSyncPlugin('niyamak-api-mutations', {
  maxRetentionTime: 24 * 60, // retry up to 24 hours
});

// ── API — GET (network-first, short TTL, serves cached data offline) ─────────
registerRoute(
  ({ url }) => url.origin === 'https://api.varunaat.in',
  new NetworkFirst({
    cacheName: 'niyamak-api-v1',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 5 * 60 }),
    ],
  }),
  'GET'
);

// ── API — mutations (NETWORK ONLY + background-sync retry on failure) ─────────
// MUST be NetworkOnly, never NetworkFirst: the Cache API cannot store a POST/PUT/
// PATCH/DELETE request, so any caching strategy throws
//   "Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported"
// which breaks the request (e.g. the auto-invoice PDF extraction POST). The
// BackgroundSyncPlugin only queues a request when the network actually fails, so
// successful writes pass straight through and nothing is ever cached.
['POST', 'PUT', 'PATCH', 'DELETE'].forEach((method) => {
  registerRoute(
    ({ url }) => url.origin === 'https://api.varunaat.in',
    new NetworkOnly({
      plugins: [bgSync],
    }),
    method
  );
});

// ── IMPORTANT: only cache SAME-ORIGIN assets ─────────────────────────────────
// A service-worker `fetch()` is governed by the page's CSP `connect-src`, NOT
// `img-src`/`font-src`. Our CSP only allows api.varunaat.in there, so if the SW
// re-fetched cross-origin assets (ui-avatars.com avatars, OpenStreetMap tiles,
// any external image) the request would fail with net::ERR_FAILED and the
// element's onError could loop. We therefore let every cross-origin request
// pass straight through to the browser (which uses img-src `https:` and works),
// and only Workbox-cache things served from our own origin.
const sameOrigin = (url) => url.origin === self.location.origin;

// ── Images (same-origin) — cache first, 7-day TTL ────────────────────────────
registerRoute(
  ({ request, url }) => request.destination === 'image' && sameOrigin(url),
  new CacheFirst({
    cacheName: 'niyamak-images-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// ── Fonts (same-origin, self-hosted) — cache first, 1-year TTL ───────────────
registerRoute(
  ({ request, url }) => request.destination === 'font' && sameOrigin(url),
  new CacheFirst({
    cacheName: 'niyamak-fonts-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

// ── JS/CSS (same-origin, hashed by Vite) — stale-while-revalidate ────────────
registerRoute(
  ({ request, url }) =>
    (request.destination === 'script' || request.destination === 'style') &&
    sameOrigin(url),
  new StaleWhileRevalidate({
    cacheName: 'niyamak-assets-v1',
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const { title = 'Niyamak', body = '', url = '/' } = event.data.json();
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/icons/pwa-192x192.png',
        badge: '/icons/pwa-72x72.png',
        vibrate: [100, 50, 100],
        data: { url },
      })
    );
  } catch { /* ignore malformed payloads */ }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(target) && 'focus' in c);
        return existing ? existing.focus() : self.clients.openWindow(target);
      })
  );
});

// ── Web Share Target ──────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (
    event.request.method === 'POST' &&
    new URL(event.request.url).pathname === '/share-target'
  ) {
    event.respondWith(Response.redirect('/', 303));
  }
});
