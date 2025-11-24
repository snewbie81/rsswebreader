// Service Worker for offline caching
const CACHE_NAME = 'rss-reader-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip caching for RSS feeds and external APIs - let them pass through
  // Parse URL to check hostname properly
  let shouldSkipCache = false;
  try {
    const url = new URL(event.request.url);
    // Check if it's an external API or RSS feed
    shouldSkipCache = 
      url.pathname.includes('.rss') ||
      url.pathname.includes('.xml') ||
      url.pathname.includes('/feed') ||
      url.hostname === 'api.rss2json.com' ||
      url.hostname === 'corsproxy.io' ||
      url.hostname.includes('redlib.') ||
      url.hostname === 'www.jagatreview.com' ||
      url.hostname === 'jagatreview.com' ||
      url.hostname === 'www.rssrssrssrss.com' ||
      url.hostname === 'rssrssrssrss.com';
  } catch (e) {
    // Invalid URL, don't skip cache
  }
  
  if (shouldSkipCache) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          // Cache the response asynchronously (don't await to avoid blocking)
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          }).catch((error) => {
            console.error('Cache put error:', error);
          });
          
          return response;
        });
      })
      .catch(() => {
        // Return a fallback page if offline
        return caches.match('/index.html');
      })
  );
});
