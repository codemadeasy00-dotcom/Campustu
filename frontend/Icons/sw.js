self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('campustu-app-shell-v1')
      .then((cache) => cache.add('/'))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return
  event.respondWith(
    fetch(event.request).catch(async () => (
      await caches.match('/') || Response.error()
    )),
  )
})

self.addEventListener('push', (event) => {
  let notification = {}
  try {
    notification = event.data ? event.data.json() : {}
  } catch {
    notification = { body: event.data?.text() || 'Open Campustu to review the update.' }
  }

  event.waitUntil(self.registration.showNotification(notification.title || 'Campustu', {
    body: notification.body || 'Open Campustu to review a Lost & Found update.',
    icon: '/favicon_512.png',
    badge: '/favicon_32.png',
    data: { url: notification.url || '/lost-found' },
    tag: 'campustu-lost-found-match',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || '/lost-found', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(destination)
        return client.focus()
      }
    }
    return self.clients.openWindow(destination)
  })())
})
