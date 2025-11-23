const CACHE_NAME = 'rss-reader-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

// Install service worker and cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('Cache installation failed:', error);
            })
    );
});

// Fetch from cache with network fallback
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                
                return fetch(event.request).then((response) => {
                    // Don't cache non-successful responses
                    if (!response || response.status !== 200) {
                        return response;
                    }

                    // Clone the response
                    const responseToCache = response.clone();

                    // Cache GET requests only
                    if (event.request.method === 'GET') {
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                    }

                    return response;
                });
            })
            .catch((error) => {
                console.error('Fetch failed:', error);
                throw error;
            })
    );
});

// Clean up old caches
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
