// MedTrack Pro Service Worker v2
const CACHE_NAME = 'medtrack-v2';
const OFFLINE_URLS = [
  './app2.html',
  './admin.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install — cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('MedTrack: caching core files');
      return cache.addAll(OFFLINE_URLS).catch(err => {
        console.warn('Some files could not be cached:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — serve from cache when offline
self.addEventListener('fetch', event => {
  // Skip non-GET and Supabase API calls (data must be live)
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.url.includes('resend.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses for app files
        if (response.ok && (
          event.request.url.includes('app2.html') ||
          event.request.url.includes('admin.html') ||
          event.request.url.includes('fonts.googleapis') ||
          event.request.url.includes('jsdelivr')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback — serve cached version
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // If requesting app page while offline, serve app2.html
          if (event.request.destination === 'document') {
            return caches.match('./app2.html');
          }
        });
      })
  );
});

// Background sync for offline administration records
self.addEventListener('sync', event => {
  if (event.tag === 'sync-records') {
    event.waitUntil(syncPendingRecords());
  }
});

async function syncPendingRecords() {
  // Pending records stored in IndexedDB by the app
  const db = await openDB();
  const pending = await getAllPending(db);
  if (!pending.length) return;
  
  // Post to app client to sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_PENDING', records: pending });
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('medtrack-offline', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readonly');
    const req = tx.objectStore('pending').getAll();
    req.onsuccess = e => resolve(e.result || []);
    req.onerror = reject;
  });
}
