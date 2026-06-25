const RELEASE_VERSION = 'V2.5.5.1';

/*
  Compatibilité de transition :
  V2.5.4.3 force encore un message SKIP_WAITING.
  Cette seule version-pont l'accepte afin que les anciens dashboards
  puissent rejoindre le nouveau système.
  Les versions suivantes ne l'accepteront plus.
*/
const LEGACY_BRIDGE_RELEASE = 'V2.5.5.1';

const CACHE_NAME = `tapcarta-resto-cache-${RELEASE_VERSION
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  /*
    Important :
    pas de self.skipWaiting() ici.
    Une nouvelle version reste en attente jusqu'à ce que l'application
    confirme qu'elle est bien autorisée et qu'un rechargement est sûr.
  */
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-store' });

            if (response && response.ok) {
              await cache.put(url, response.clone());
            }
          } catch (error) {
            console.warn('TapCarta SW: cache install skipped for', url, error);
          }
        })
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function offlineResponse(message = 'TapCarta est temporairement indisponible hors ligne.') {
  return new Response(message, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch(() => {});
            });
          }

          return response;
        })
        .catch(async () => {
          const cachedRequest = await caches.match(request);
          if (cachedRequest) return cachedRequest;

          const cachedIndex = await caches.match('./index.html');
          if (cachedIndex) return cachedIndex;

          const cachedRoot = await caches.match('./');
          if (cachedRoot) return cachedRoot;

          return offlineResponse();
        })
    );

    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response || offlineResponse();
        }

        const responseClone = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone).catch(() => {});
        });

        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        return offlineResponse();
      })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'GET_RELEASE_VERSION') {
    event.source?.postMessage?.({
      type: 'TAPCARTA_RESTO_RELEASE_VERSION',
      version: RELEASE_VERSION
    });

    return;
  }

  const requestedVersion = String(data.version || '').trim();

  const isAuthorizedReleaseActivation =
    data.type === 'ACTIVATE_RELEASE' &&
    requestedVersion === RELEASE_VERSION;

  const isLegacyBridgeActivation =
    data.type === 'SKIP_WAITING' &&
    RELEASE_VERSION === LEGACY_BRIDGE_RELEASE;

  if (isAuthorizedReleaseActivation || isLegacyBridgeActivation) {
    event.waitUntil(self.skipWaiting());
  }
});
