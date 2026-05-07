/**
 * SwapSkill — Service Worker  (production-ready)
 * Strategy:
 *   • App shell (HTML, fonts)  → Cache-First, network fallback
 *   • Firebase / API calls     → Network-Only  (never cache auth/db)
 *   • Everything else          → Stale-While-Revalidate
 *
 * Bump CACHE_VERSION when you deploy a new build so old caches are purged.
 */

'use strict';

const CACHE_VERSION = 'v1.2.0';
const CACHE_NAME    = `swapskill-${CACHE_VERSION}`;

// ── Resources to pre-cache on install ──────────────────────────────────────
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Domains that must NEVER be cached (auth, Firestore, analytics) ─────────
const NETWORK_ONLY_ORIGINS = [
  'firebaseapp.com',
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
  'google-analytics.com',
  'firebase.google.com',
];

function isNetworkOnly(url) {
  try {
    const { hostname } = new URL(url);
    return NETWORK_ONLY_ORIGINS.some(o => hostname.endsWith(o));
  } catch { return false; }
}

// ── INSTALL — pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => {
        console.log('[SW] Pre-cache complete');
        // Don't call skipWaiting() here — we do it on message from client
        // so the old SW keeps serving until the user reloads.
      })
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

// ── ACTIVATE — delete stale caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('swapskill-') && k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── MESSAGE — allow client to force activation ──────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING — activating now');
    self.skipWaiting();
  }
});

// ── FETCH — routing strategy ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // 1. Only handle GET requests
  if (request.method !== 'GET') return;

  // 2. Network-only for Firebase / Google APIs
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Cache-first for the app shell (HTML + pre-cached assets)
  const isAppShell = PRECACHE_URLS.some(p => url.endsWith(p.replace('./', '/'))) ||
                     url.endsWith('/') ||
                     url.endsWith('/index.html');

  if (isAppShell) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          // Refresh cache in background
          fetch(request).then(resp => {
            if (resp && resp.status === 200) {
              caches.open(CACHE_NAME).then(c => c.put(request, resp));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then(resp => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return resp;
        });
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 4. Stale-while-revalidate for everything else (fonts, icons, etc.)
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request).then(resp => {
          if (resp && resp.status === 200) {
            cache.put(request, resp.clone());
          }
          return resp;
        }).catch(() => cached);  // offline fallback
        return cached || networkFetch;
      })
    )
  );
});
