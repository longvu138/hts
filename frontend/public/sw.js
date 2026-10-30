const CACHE_NAME = 'hts-pwa-v1'
const IS_DEVELOPMENT = new URL(self.location.href).searchParams.get('mode') === 'development'
const APP_SHELL = [
  '/',
  '/index.html',
  '/favicon.svg?v=20260613',
  '/manifest.webmanifest',
  '/pwa-icon.svg?v=20260613',
  '/pwa-192x192.png?v=20260613',
  '/pwa-512x512.png?v=20260613',
]

self.addEventListener('install', (event) => {
  if (IS_DEVELOPMENT) {
    self.skipWaiting()
    return
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) =>
              cacheName.startsWith('hts-pwa-') &&
              (IS_DEVELOPMENT || cacheName !== CACHE_NAME),
            )
            .map((cacheName) => caches.delete(cacheName)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (IS_DEVELOPMENT) {
    return
  }

  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) {
    return
  }

  if (
    requestUrl.pathname.startsWith('/src/') ||
    requestUrl.pathname.startsWith('/@vite/') ||
    requestUrl.pathname.startsWith('/@react-refresh') ||
    requestUrl.pathname.startsWith('/node_modules/') ||
    requestUrl.pathname === '/@vite/client'
  ) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse
        }

        const responseToCache = networkResponse.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache))
        return networkResponse
      })
    }),
  )
})

const parsePushData = (event) => {
  try {
    return event.data ? event.data.json() : {}
  } catch {
    return {
      title: 'Thông báo mới',
      message: event.data ? event.data.text() : '',
    }
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushData(event)

  const title = data.title || 'Thông báo mới'
  const options = {
    body: data.message || 'Bạn có thông báo mới',
    icon: '/pwa-192x192.png?v=20260613',
    badge: '/pwa-192x192.png?v=20260613',
    tag: data.notificationId || undefined,
    data: {
      url: data.url || '/',
      notificationId: data.notificationId || null,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const requestedUrl = new URL(event.notification.data?.url || '/', self.location.origin)
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : self.location.origin

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const sameOriginClient = clientList.find((client) => client.url.startsWith(self.location.origin))

      if (sameOriginClient) {
        if ('navigate' in sameOriginClient) {
          return sameOriginClient.navigate(targetUrl).then((client) => client?.focus())
        }
        return sameOriginClient.focus()
      }

      return self.clients.openWindow(targetUrl)
    }),
  )
})
