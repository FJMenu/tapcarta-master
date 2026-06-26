const RELEASE_VERSION = 'V2.5.5.1';

const CACHE_NAME = `tapcarta-resto-cache-${RELEASE_VERSION
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')}`;

const APP_SHELL = [
  './',
  './index.html',
  `./manifest.webmanifest?v=${encodeURIComponent(RELEASE_VERSION)}`,
  './icon-192.png',
  './icon-512.png',
  `./favicon.png?v=${encodeURIComponent(RELEASE_VERSION)}`
];

function getScopedUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

function offlineResponse(message = 'TapCarta est temporairement indisponible hors ligne.') {
  return new Response(message, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  for (const path of APP_SHELL) {
    const request = new Request(getScopedUrl(path), {
      cache: 'reload'
    });

    const response = await fetch(request);

    if (!response || !response.ok) {
      throw new Error(`TapCarta SW: impossible de préparer le shell ${path}`);
    }

    await cache.put(request, response.clone());
  }
}

async function matchCurrentReleaseCache(request, fallbackPath = '') {
  const cache = await caches.open(CACHE_NAME);

  const directMatch = await cache.match(request, {
    ignoreSearch: true
  });

  if (directMatch) {
    return directMatch;
  }

  if (fallbackPath) {
    return cache.match(getScopedUrl(fallbackPath), {
      ignoreSearch: true
    });
  }

  return undefined;
}

function isAppShellRequest(request, requestUrl) {
  const scopeUrl = new URL(self.registration.scope);
  const rootPath = scopeUrl.pathname;
  const indexPath = `${rootPath}index.html`;

  return (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    requestUrl.pathname === rootPath ||
    requestUrl.pathname === indexPath
  );
}

self.addEventListener('install', (event) => {
  /*
    Pas de skipWaiting ici.
    Le nouveau worker prépare son propre cache puis reste en attente
    jusqu'à une activation autorisée par le contrôleur Resto.
  */
  event.waitUntil(cacheAppShell());
});

self.addEventListener('activate', (event) => {
  /*
    Ne pas supprimer les autres caches ici.
    Une release plus récente peut déjà être téléchargée et en attente :
    son cache doit rester intact jusqu'à son éventuelle activation.
  */
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  if (
    !requestUrl.protocol.startsWith('http') ||
    requestUrl.origin !== self.location.origin
  ) {
    return;
  }

  /*
    Le shell reste strictement attaché au cache de la release ACTIVE.
    Ainsi, un index.html publié plus récent ne peut jamais arriver
    avant que le worker correspondant ait été autorisé à s'activer.
  */
  if (isAppShellRequest(request, requestUrl)) {
    event.respondWith(
      matchCurrentReleaseCache(request, './index.html')
        .then((cachedResponse) => cachedResponse || offlineResponse())
        .catch(() => offlineResponse())
    );

    return;
  }

  /*
    Les données vivantes restent réseau d'abord :
    fichiers restaurant, JSON, images ou autres ressources locales.
    En cas de coupure réseau, seul le cache de la release active sert
    comme secours, sans consulter les caches des versions en attente.
  */
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(async (response) => {
        if (!response || !response.ok || response.type === 'opaque') {
          return response || offlineResponse();
        }

        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});

        return response;
      })
      .catch(async () => {
        const cachedResponse = await matchCurrentReleaseCache(request);

        return cachedResponse || offlineResponse();
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

  if (
    data.type === 'ACTIVATE_RELEASE' &&
    requestedVersion === RELEASE_VERSION
  ) {
    event.waitUntil(self.skipWaiting());
  }
});