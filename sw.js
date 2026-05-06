/* ============================================================
   SwapSkill Service Worker — sw.js
   v2 — uses relative paths, works on GitHub Pages subdirectories
   ============================================================ */
'use strict';

const CACHE_NAME  = 'swapskill-v2';
const FONTS_CACHE = 'swapskill-fonts-v1';

// Relative paths — works regardless of GitHub Pages repo name
const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
];

// ── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // allSettled so one missing icon doesn't kill the whole install
      Promise.allSettled(APP_SHELL.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — wipe old caches ───────────────────────────────
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

  // Never intercept Firebase / Google API traffic
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  // Google Fonts — cache-first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(FONTS_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(res => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Everything else — network-first, cache fallback
  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(cached => {
            if (cached) return cached;
            // Navigation fallback → serve the app shell
            if (request.mode === 'navigate') {
              return caches.match('index.html');
            }
            return new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          })
        )
    );
  }
});

// ── PUSH (future-ready) ─────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let d = {};
  try { d = event.data.json(); } catch(e) { d = { title:'SwapSkill', body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(d.title || 'SwapSkill', {
      body:    d.body    || 'You have a new notification!',
      icon:    'icon-192.png',
      badge:   'icon-192.png',
      vibrate: [100, 50, 100],
      data:    d.url || '.',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow(event.notification.data || '.');
    })
  );
});
