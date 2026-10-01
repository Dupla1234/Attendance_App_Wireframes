const CACHE_NAME = 'attendancepro-shell-v2';
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/logo.svg',
  './assets/pwa-icon.svg',
  './assets/pwa-icon-180.png',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
  './pages/login.html',
  './pages/dashboard.html',
  './pages/attendance-history.html',
  './pages/profile.html',
  './pages/offline.html',
  './pages/out-of-bounds.html',
  './pages/admin-monitoring.html',
  './pages/admin-employees.html',
  './pages/admin-branches.html',
  './pages/admin-reports.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith('attendancepro-') && cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        }
        return response;
      }).catch(async () => {
        const cachedPage = await caches.match(request);
        return cachedPage || caches.match('./pages/offline.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => cachedResponse || fetch(request).then((response) => {
      if (response.ok) {
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
      }
      return response;
    }))
  );
});
