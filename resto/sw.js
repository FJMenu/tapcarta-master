const SW_VERSION = 'V2.5.5.2';

/*
  Version de déploiement commune :
  elle doit toujours correspondre à APP_VERSION dans resto/index.html.
  Elle est distincte de la version propre du fichier sw.js.
*/
const RELEASE_VERSION = 'V2.5.6.2';

const CACHE_NAME = `tapcarta-cache-${SW_VERSION}`;

const APP_SHELL = [
  './manifest.webmanifest',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  /*
    Pas de skipWaiting automatique :
    une future version reste en attente jusqu’à autorisation du contrôleur.
    Sur une installation neuve, le worker devient actif normalement.
  */
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
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

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (!request || request.method !== 'GET') {
    return;
  }

  let requestUrl;

  try {
    requestUrl = new URL(request.url);
  } catch {
    return;
  }

  if (!['http:', 'https:'].includes(requestUrl.protocol)) {
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => fetch('./', { cache: 'no-store' }))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response || new Response('', {
            status: 502,
            statusText: 'Bad Gateway'
          });
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

        return new Response('', {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      })
  );
});

self.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.type === 'GET_RELEASE_VERSION') {
    event.source?.postMessage({
      type: 'TAPCARTA_RESTO_RELEASE_VERSION',
      version: RELEASE_VERSION
    });

    return;
  }

  if (
    message.type === 'ACTIVATE_RELEASE' &&
    message.version === RELEASE_VERSION
  ) {
    event.waitUntil(self.skipWaiting());
  }
});