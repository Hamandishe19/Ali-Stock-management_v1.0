const CACHE_NAME = 'hardware-stock-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './login.html',
  './inventory.html',
  './transaction.html',
  './history.html',
  './shared.css',
  './config.js',
  './auth.js',
  './sync.js',
  './db.js',
  './db-init-data.js',
  './app.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

// Install Service Worker and cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching Assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate Service Worker and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache...', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Intercept fetch requests and serve cached content offline
self.addEventListener('fetch', (event) => {
  // Only cache GET requests (ignore POST, PUT, etc.)
  if (event.request.method !== 'GET') {
    return;
  }

  // Avoid caching browser extension schemes or non-http protocols
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // NEVER cache Supabase API calls! We handle those in sync.js / offline db
  if (event.request.url.includes('.supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached file if found
        return cachedResponse;
      }

      // Otherwise fetch from network
      return fetch(event.request)
        .then((response) => {
          // Check if response is valid
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Dynamically cache new GET requests (excluding third-party scripts we don't want to store dynamically)
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(async () => {
          console.warn('Fetch failed, user is likely offline:', event.request.url);
          if (event.request.mode === 'navigate') {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
          }
          return new Response('Offline — please reconnect.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});
