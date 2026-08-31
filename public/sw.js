const CACHE_NAME = 'vani-xai-cache-v2026-q2'; // Fresh cache version
const urlsToCache = [
  '/',
  '/index.html',
  '/ai4consol.html',
  '/settings.html',
  '/style.css',
  '/main.js',
  '/vani_icon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Force SW to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Delete old caches
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all clients immediately
});

// Network-First Strategy
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  // Exclude API calls, firebase-messaging-sw, or external domains
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes('firebase-messaging-sw.js')) {
      return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If network fetch succeeds, cache the new response and return it
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        // If network fails, try falling back to cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If not in cache and offline, return the root index.html as a fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/');
            }
          });
      })
  );
});

// Background Push Notification Handlers
self.addEventListener('push', event => {
  let data = { title: 'V.A.N.I-xAI Push Alert', body: 'New system broadcast received.' };
  if (event.data) {
    try { data = event.data.json(); } catch(e) { data.body = event.data.text(); }
  }
  const options = {
    body: data.body,
    icon: '/vani_icon.png',
    badge: '/vani_icon.png',
    data: { url: '/ai4consol' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/ai4consol') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/ai4consol');
      }
    })
  );
});
