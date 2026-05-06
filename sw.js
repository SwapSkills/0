/* ============================================================
   SwapSkill Service Worker — sw.js
   Caches the app shell so it loads instantly & works offline.
   ============================================================ */
'use strict';

const CACHE_NAME   = 'swapskill-v1';
const FONTS_CACHE  = 'swapskill-fonts-v1';

// Files to pre-cache on install (app shell)
const APP_SHELL = [
  'SwapSkills.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

// ── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use individual adds so one missing file doesn't kill install
      return Promise.allSettled(APP_SHELL.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONTS_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept Firebase / Google API calls — always network
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com')
  ) {
    return; // Let browser handle natively (network only)
  }

  // Google Fonts — cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONTS_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // App shell (HTML, manifest, icons) — network-first with cache fallback
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => {
          if (cached) return cached;
          // For navigation requests, return the app shell
          if (request.mode === 'navigate') {
            return caches.match('SwapSkills.html');
          }
          return new Response('Offline — please reconnect.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        }))
    );
    return;
  }
});

// ── PUSH NOTIFICATIONS (future-ready) ───────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'SwapSkill', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'SwapSkill', {
      body:  data.body  || 'You have a new notification!',
      icon:  data.icon  || 'icon-192.png',
      badge: 'icon-192.png',
      data:  data.url   || '/',
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return clients.openWindow(event.notification.data || '/');
    })
  );
});
