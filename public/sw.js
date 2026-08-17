const CACHE_NAME = 'vani-xai-cache-v9'; // Incremented cache version
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js?v=5',
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
  
  // Exclude API calls or external domains if necessary
  if (!event.request.url.startsWith(self.location.origin)) {
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
