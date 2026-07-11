// ─────────────────────────────────────────────────────────────
//  JDI Stock Management — Service Worker
//  Strategy:
//    • App files  (HTML/JS/CSS) → Network-first  (always fresh)
//    • Fonts / CDN              → Cache-first    (stable, rarely change)
//    • Supabase API calls       → Never cached   (handled by sync.js)
// ─────────────────────────────────────────────────────────────

// Bump this version any time you deploy a significant change.
// This automatically clears old caches on activation.
const CACHE_VERSION = 'v5';
const APP_CACHE     = `jdi-app-${CACHE_VERSION}`;
const STATIC_CACHE  = `jdi-static-${CACHE_VERSION}`;

// App shell files — always fetched fresh from network
const APP_FILES = [
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
];

// Stable third-party assets — cached indefinitely
const STATIC_FILES = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)),
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_FILES)),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate: wipe every old cache ──────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== STATIC_CACHE)
          .map((k) => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Only handle http/https
  if (!request.url.startsWith('http')) return;

  // ❌ Never intercept Supabase — must always hit the live API
  if (request.url.includes('.supabase.co')) return;

  const isAppFile = APP_FILES.some((f) =>
    request.url.endsWith(f.replace('./', '/')) ||
    request.url.includes(f.replace('./', ''))
  ) || request.mode === 'navigate';

  if (isAppFile) {
    // ── Network-first for app files ──────────────────────────
    // Always try network. If offline, serve cache. If no cache, offline page.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(APP_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
  } else {
    // ── Cache-first for fonts and stable CDN assets ───────────
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
