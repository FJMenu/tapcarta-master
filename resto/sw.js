const SW_VERSION = 'V2.5.5.3';

const CACHE_NAME = `tapcarta-resto-${SW_VERSION}`;

const APP_SHELL = [
  './manifest.webmanifest',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  /*
    Un nouveau worker reste en attente.
    Il sera activé uniquement lorsque index.html confirmera
    que la tablette est dans une fenêtre sûre.
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
            .filter(
              (key) =>
                key.startsWith('tapcarta-resto-') &&
                key !== CACHE_NAME
            )
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

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  /*
    index.html n’est jamais servi depuis un ancien cache.
    Après activation autorisée + reload, la tablette récupère
    donc l’HTML réellement publié dans GitHub Pages.
  */
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((response) => {
        if (!response || !response.ok || response.type === 'opaque') {
          return response;
        }

        const responseClone = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, responseClone))
          .catch(() => {});

        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        return new Response('', {
          status: 503,
          statusText: 'Offline',
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        });
      })
  );
});

self.addEventListener('message', (event) => {
  const message = event.data || {};

  /*
    Le HTML demande seulement l’identité du worker en attente.
    Ce n’est pas une règle métier de version.
  */
  if (message.type === 'GET_RELEASE_VERSION') {
    event.source?.postMessage({
      type: 'TAPCARTA_RESTO_RELEASE_VERSION',
      version: SW_VERSION
    });

    return;
  }

  /*
    L’autorisation d’activer vient uniquement du HTML,
    après vérification que la tablette est inactive.
    Aucune comparaison de V ne décide ici.
  */
  if (message.type === 'ACTIVATE_RELEASE') {
    event.waitUntil(self.skipWaiting());
  }
});