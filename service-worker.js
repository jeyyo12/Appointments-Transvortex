/**
 * Service Worker - Basic Reliable Caching
 * Network-first for HTML, Stale-while-revalidate for assets
 * No infinite reload loops, no complex update logic
 */

const CACHE_NAME = 'transvortex-v23-deploy-parity-20260219';
const CRITICAL_ASSETS = [
  './index.html',
  './invoice.html',
  './styles.css',
  './script.js'
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
        // Try to cache icons from Logo/ folder (non-critical)
        return caches.open(CACHE_NAME).then(cache => {
          // Logo folder icons
          cache.add('Logo/icon-32.png').catch(() => {
            console.log('[Service Worker] Logo icon-32 not cached (OK)');
          });
          cache.add('Logo/icon-192.png').catch(() => {
            console.log('[Service Worker] Logo icon-192 not cached (OK)');
          });
          cache.add('Logo/icon-512.png').catch(() => {
            console.log('[Service Worker] Logo icon-512 not cached (OK)');
          });
          cache.add('Logo/apple-touch-icon.png').catch(() => {
            console.log('[Service Worker] Logo apple-touch-icon not cached (OK)');
          });
          cache.add('Logo/transvortex.png').catch(() => {
            console.log('[Service Worker] Logo transvortex not cached (OK)');
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
  
  // NETWORK-FIRST for manifest (always get fresh PWA config)
  if (url.pathname.includes('manifest.webmanifest')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache fresh manifest
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, copy);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline: return cached manifest
          return caches.match(event.request);
        })
    );
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

