/* =====================================================================
   StudyDesk service worker (optional, enables install + offline use)
   Keep this file in the SAME folder as the app page, named sw.js.
   It saves a copy of the page after the first visit so the app still
   opens without internet. Change CACHE_NAME to force an update.
   ===================================================================== */
const CACHE_NAME = 'studydesk-v6';

/* On install: take over right away and cache the app's folder page. */
self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(function (c) { return c.add('./').catch(function () {}); }));
});

/* On activate: delete old caches from earlier versions. */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

/* On every request: try the network first (so updates show up),
   save a copy, and fall back to the saved copy when offline. */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('./'); });
      })
  );
});
