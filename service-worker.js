/**
 * Service Worker for Transvortex PWA
 * Implements network-first for HTML, stale-while-revalidate for assets
 * Ensures fresh invoice UI on normal refresh
 */

const CACHE_VERSION = '2026-02-12-05'; // Increment this to force cache update
const CACHE_NAME = `transvortex-v${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './invoice.html',
  './script.js',
  './styles.css',
  './language.js',
  './init-language.js',
  './pwa.js',
  './sw-update.js',
  './manifest.webmanifest',
  './assets/images/Logo.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-192x192.png',
  './icons/icon-maskable-512x512.png',
  './src/config/firebase.js',
  './src/config/firebase.config.js',
  './src/config/constants.js',
  './src/core/app.js',
  './src/core/app-state.js',
  './src/core/auth-state.js',
  './src/core/event-bus.js',
  './src/core/events.js',
  './src/services/firebase-service.js',
  './src/services/auth-service.js',
  './src/services/appointment-service.js',
  './src/services/page-service.js',
  './src/services/historyService.js',
  './src/invoice.js',
  './src/modal.js',
  './src/shared/modal.js',
  './src/ui/components/base-modal.js',
  './src/ui/components/details-modal.js',
  './src/ui/components/finalize-modal.js',
  './src/ui/components/index.js',
  './src/utils/formatters.js',
  './src/utils/normalizers.js',
  './src/utils/notifications.js',
  './src/utils/validators.js',
  './styles/appointment-form.css',
  './styles/appointments.css',
  './styles/buttons.css',
  './styles/design-system.css',
  './styles/invoice.css',
  './styles/modal.css'
];

/**
 * Install event - cache essential assets
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[Service Worker] Some assets failed to cache:', err);
        // Continue even if some assets fail to cache
        return Promise.resolve();
      });
    }).then(() => {
      console.log('[Service Worker] Installation complete');
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - cleanup old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Activation complete');
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - smart caching strategy
 * HTML: network-first (always try to get latest)
 * Invoice assets (CSS, JS): network-first with cache fallback
 * Other assets: stale-while-revalidate
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests, Firebase requests, and WebSocket protocols
  if (url.origin !== location.origin || url.protocol.startsWith('ws')) {
    return;
  }
  
  // For Firebase API calls, use network-only
  if (url.pathname.includes('/firestore.googleapis.com') || 
      url.pathname.includes('/.netlify/functions')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // NETWORK-FIRST for HTML files (invoice.html, index.html)
  // This ensures users always get the latest HTML on normal refresh
  const isHTMLRequest = request.mode === 'navigate' || 
                        request.destination === 'document' ||
                        url.pathname.endsWith('.html');
  
  if (isHTMLRequest) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          // Cache the fresh HTML for offline use
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, use cached version
          console.log('[Service Worker] Network failed for HTML, using cache:', url.pathname);
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('./index.html');
          });
        })
    );
    return;
  }
  
  // NETWORK-FIRST for invoice-specific assets
  // Ensures invoice.js and invoice.css always load fresh
  const isInvoiceAsset = url.pathname.includes('/styles/invoice.css') ||
                         url.pathname.includes('/src/invoice.js');
  
  if (isInvoiceAsset) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          // Cache the fresh version for offline use
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, use cached version
          console.log('[Service Worker] Network failed for invoice asset, using cache:', url.pathname);
          return caches.match(request);
        })
    );
    return;
  }
  
  // STALE-WHILE-REVALIDATE for other CSS, JS, images, fonts
  // Serve from cache immediately, update cache in background
  const isAsset = request.destination === 'style' ||
                  request.destination === 'script' ||
                  request.destination === 'image' ||
                  request.destination === 'font' ||
                  url.pathname.endsWith('.js') ||
                  url.pathname.endsWith('.css') ||
                  url.pathname.endsWith('.png') ||
                  url.pathname.endsWith('.jpg') ||
                  url.pathname.endsWith('.jpeg') ||
                  url.pathname.endsWith('.gif') ||
                  url.pathname.endsWith('.svg') ||
                  url.pathname.endsWith('.woff') ||
                  url.pathname.endsWith('.woff2');
  
  if (isAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          // Update cache with fresh version
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((error) => {
          console.log('[Service Worker] Fetch failed for asset, using cache:', url.pathname);
          return cachedResponse;
        });
        
        // Return cached version immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
  
  // For other requests, use network-only
  event.respondWith(fetch(request));
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] Loaded');
