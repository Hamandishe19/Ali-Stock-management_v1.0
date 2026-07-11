/**
 * sw.js — Minimal Service Worker
 *
 * Rules:
 *  • JavaScript files  → NEVER cached (always fresh from server)
 *  • HTML pages        → Network-first, cache as offline fallback only
 *  • Supabase API      → NEVER intercepted (always live)
 *  • Fonts / Tailwind  → Cache-first (stable, saves bandwidth)
 */

const CACHE_VERSION = 'v6';
const SHELL_CACHE   = `jdi-shell-${CACHE_VERSION}`;
const STATIC_CACHE  = `jdi-static-${CACHE_VERSION}`;

const HTML_PAGES = [
  './index.html',
  './login.html',
  './inventory.html',
  './transaction.html',
  './history.html',
];

const STABLE_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap',
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(c => c.addAll(HTML_PAGES)),
      caches.open(STATIC_CACHE).then(c => c.addAll(STABLE_ASSETS)),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate: delete all old caches ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== STATIC_CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // ❌ Never touch Supabase — must always reach live API
  if (request.url.includes('.supabase.co')) return;

  // ❌ Never cache JS or CSS files — always fetch live so deploys are instant
  if (request.url.match(/\.(js|css)(\?.*)?$/)) {
    event.respondWith(fetch(request));
    return;
  }

  // ✅ Stable CDN assets (Tailwind, Supabase SDK, Fonts) — cache-first
  const isStable = STABLE_ASSETS.some(a => request.url.includes(a.replace('https://', '')));
  if (isStable) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        if (res && res.status === 200) {
          caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()));
        }
        return res;
      }))
    );
    return;
  }

  // ✅ HTML pages — network-first, fall back to cache when offline
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res && res.status === 200) {
          caches.open(SHELL_CACHE).then(c => c.put(request, res.clone()));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('./index.html');
      })
  );
});
