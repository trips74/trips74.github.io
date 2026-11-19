// Service worker for the trips app. Keeps the app shell available offline.
// Bump VERSION when index.html or its shell changes, so old caches are replaced.
const VERSION = 'trips-v1';
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const SHELL = [INDEX_URL];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Never intercept Google sign-in or Firebase data requests.
// Firestore has its own offline storage, and those calls must go to the network.
function isBypass(url) {
  return url.hostname.endsWith('googleapis.com') ||
         url.hostname.endsWith('google.com') ||
         url.hostname.endsWith('firebaseapp.com') ||
         url.hostname.endsWith('firebaseio.com');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isBypass(url)) return;

  // Page loads: network first, so updates arrive when online. Offline, use the saved copy.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(INDEX_URL, copy));
          return res;
        })
        .catch(() => caches.match(INDEX_URL))
    );
    return;
  }

  // Our own files and the Firebase SDK files: cache first, then store what we fetch.
  if (url.origin === self.location.origin || url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
