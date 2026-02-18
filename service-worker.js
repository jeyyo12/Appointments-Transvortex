/**
 * Service Worker - Basic Reliable Caching
 * Network-first for HTML, Stale-while-revalidate for assets
 * No infinite reload loops, no complex update logic
 */

const CACHE_NAME = 'transvortex-v6'; // Fixed KPI counters - now updates from allInvoices
const CRITICAL_ASSETS = [
  './index.html',
  './invoice.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest'
];

/**
 * Install - Cache essential assets
 */
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching critical assets');
        // Cache critical assets first
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => {
        // Try to cache icons (non-critical)
        return caches.open(CACHE_NAME).then(cache => {
          cache.add('./icons/icon-192x192.png').catch(() => {
            console.log('[Service Worker] Icon 192 not cached (OK)');
          });
          cache.add('./icons/icon-512x512.png').catch(() => {
            console.log('[Service Worker] Icon 512 not cached (OK)');
          });
          cache.add('./icons/icon-maskable-192x192.png').catch(() => {
            console.log('[Service Worker] Maskable icon 192 not cached (OK)');
          });
          cache.add('./icons/icon-maskable-512x512.png').catch(() => {
            console.log('[Service Worker] Maskable icon 512 not cached (OK)');
          });
        });
      })
      .catch(err => {
        console.warn('[Service Worker] Install error:', err);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate - Clean up old caches
 */
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch - Smart caching strategy
 * HTML: Network-first (always try fresh)
 * Assets: Stale-while-revalidate (cache first)
 */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin and Firebase API calls
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip API/backend calls
  if (url.pathname.includes('firebase') || 
      url.pathname.includes('googleapis') ||
      url.pathname.includes('.netlify')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // NETWORK-FIRST for HTML
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache fresh HTML
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, copy);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline: return cached HTML or fallback to index.html
          return caches.match(event.request)
            .then(response => response || caches.match('index.html'));
        })
    );
    return;
  }
  
  // STALE-WHILE-REVALIDATE for assets
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            // Cache fresh asset
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, copy);
              });
            }
            return response;
          });
        
        // Return cached, or wait for network
        return cached || fetchPromise;
      })
      .catch(() => caches.match(event.request))
  );
});

console.log('[Service Worker] Loaded and ready');

