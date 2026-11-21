/* StudyDesk copyright 2026 RANSFORD VINDINOBA. all rights reserved */

/* Optional offline cache. Bump CACHE_NAME to update it. */
const CACHE_NAME = 'studydesk-v21';
const APP_SHELL = ['./', './style.css', './script.js'];
const APP_SHELL_URLS = APP_SHELL.map(function (path) { return new URL(path, self.location.href).href; });

/* Activate and cache the app page. */
self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function (c) { return c.addAll(APP_SHELL); }));
});

/* Remove old caches. */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('studydesk-v') === 0 && k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Prefer network; use cache offline. */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  const isShellResource = APP_SHELL_URLS.indexOf(req.url) !== -1;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin ||
      (!isShellResource && req.mode !== 'navigate')) return;
  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res.ok) {
          event.waitUntil(caches.open(CACHE_NAME).then(function (c) { return c.put(req, res.clone()); })
            .catch(function (error) { console.warn('StudyDesk cache update failed', error); }));
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          return req.mode === 'navigate' ? caches.match('./') : Response.error();
        });
      })
  );
});
