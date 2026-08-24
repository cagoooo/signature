// BUILD_VERSION 由 Vite build plugin 在 dist 產出時自動注入。
// 請勿在原始檔手動填入固定版本，否則瀏覽器不會偵測到新版 SW。
const BUILD_VERSION = "20260824065007-2da9f57";
const CACHE_NAME = `signature-${BUILD_VERSION}`;

// 不快取 index.html：Vite 每次建置都會產生新的 hashed chunk，HTML 必須走 network-first。
const PRECACHE_URLS = [
  './favicon.ico',
  './favicon.svg',
  './apple-touch-icon.png',
  './site.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  // 保留 waiting 狀態，讓使用者決定何時重新整理，不打斷正在填寫的同意書。
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) await cache.put(url, response);
          } catch {
            // 圖示不是核心流程，單一資產失敗不應阻止 SW 安裝。
          }
        }),
      );
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('signature-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim())
      .then(async () => {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED', version: BUILD_VERSION });
        });
      }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  // HTML 與版本檔永遠優先取網路，避免舊 HTML 指向已不存在的 Vite chunk。
  if (
    request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/version.json')
  ) {
    if (url.pathname.endsWith('/version.json')) {
      event.respondWith(networkFirst(new Request(request, { cache: 'no-store' })));
    } else {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  // Vite hashed assets 與固定品牌資產可按 URL cache-first；新 hash 會自然形成新 cache key。
  if (
    url.pathname.includes('/assets/')
    || /\.(?:js|css|woff2?|png|svg|ico|webmanifest)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});
