/**
 * Service Worker for Transvortex PWA
 * Implements cache-first strategy for offline support
 */

const CACHE_NAME = 'transvortex-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './invoice.html',
  './script.js',
  './styles.css',
  './language.js',
  './init-language.js',
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
 * Fetch event - cache-first strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests, Firebase requests, and WebSocket protocols
  if (url.origin !== location.origin || url.protocol.startsWith('ws')) {
    return;
  }
  
  // For Firebase API calls, use network-first
  if (url.pathname.includes('/firestore.googleapis.com') || 
      url.pathname.includes('/.netlify/functions')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // For everything else, use cache-first strategy
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }
      
      return fetch(request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Clone the response
        const responseToCache = response.clone();
        
        // Cache successful responses for certain file types
        const isCacheable = 
          request.method === 'GET' &&
          (request.destination === 'style' ||
           request.destination === 'script' ||
           request.destination === 'image' ||
           request.destination === 'font' ||
           request.destination === 'document' ||
           url.pathname.endsWith('.html') ||
           url.pathname.endsWith('.js') ||
           url.pathname.endsWith('.css') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.jpg') ||
           url.pathname.endsWith('.jpeg') ||
           url.pathname.endsWith('.gif') ||
           url.pathname.endsWith('.svg'));
        
        if (isCacheable) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        
        return response;
      });
    }).catch(() => {
      // Return index.html as fallback for navigation requests
      if (request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return null;
    })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] Loaded');
