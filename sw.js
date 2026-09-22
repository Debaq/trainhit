// Service worker: que la página siga andando sin red.
//
// Es una herramienta de aula, y en el aula el wifi falla. Lo que pesa —el
// runtime de MediaPipe y el modelo, unos 10 MB— se guarda la primera vez y
// después se sirve de acá aunque no haya red. Los archivos propios van con
// red primero: llevan `?v=…`, así que una versión nueva es una dirección
// nueva y se baja sola; si no hay red, se sirve la copia guardada.
//
// La página funciona igual sin service worker: esto solo suma el modo sin red.

const CACHE = 'trainhit-v1';

/** Lo que se pide a la red primero y se guarda; sin red, se sirve lo guardado. */
const PROPIO = (url) => url.origin === self.location.origin;

/** Lo que se sirve de la caché primero: pesado y versionado por URL. */
const PESADO = (url) =>
  url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'storage.googleapis.com';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (PESADO(url)) e.respondWith(cachePrimero(e.request));
  else if (PROPIO(url)) e.respondWith(redPrimero(e.request));
  // Lo demás (el contador) va derecho a la red.
});

async function cachePrimero(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function redPrimero(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone());
      limpiaVersionesViejas(cache, req);
    }
    return res;
  } catch {
    const guardado = await cache.match(req, { ignoreSearch: false });
    if (guardado) return guardado;
    // Sin red y sin esa versión exacta: la última que haya del mismo archivo.
    const cualquiera = await cache.match(req, { ignoreSearch: true });
    if (cualquiera) return cualquiera;
    throw new Error(`sin red y sin copia de ${req.url}`);
  }
}

/** Del mismo archivo con otro `?v=`, se queda solo el que acaba de bajar. */
async function limpiaVersionesViejas(cache, req) {
  const nueva = new URL(req.url);
  if (!nueva.search) return;
  for (const k of await cache.keys()) {
    const u = new URL(k.url);
    if (u.origin === nueva.origin && u.pathname === nueva.pathname && u.search !== nueva.search) cache.delete(k);
  }
}
