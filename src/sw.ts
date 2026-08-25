import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// Precache assets from build manifest
precacheAndRoute(self.__WB_MANIFEST);

// Cache API responses with network-first strategy
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api' })
);

// Cache static assets with cache-first strategy
registerRoute(
  ({ request }) =>
    request.destination === 'style' || request.destination === 'script',
  new CacheFirst({ cacheName: 'assets' })
);

// Handle skipWaiting message from client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install: take control immediately
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate: claim existing clients
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
