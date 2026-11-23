/*
 * Service worker de RoxCoach (fase 12): mínimo y acotado.
 * - Navegaciones: siempre a la red; SOLO si falla se redirige a una página
 *   offline cacheada (el shell estático de la ejecución con ?sesion= o
 *   /sin-conexion?desde=). Nunca se guarda el HTML de una navegación.
 * - Estáticos con hash, iconos y manifest: primero caché.
 * - Todo lo demás (POST, Server Actions, RSC, Supabase, otros orígenes) no se toca.
 * Actualización: install → skipWaiting; activate → borra cachés anteriores y
 * clients.claim(). Ver docs/architecture.md (fase 12).
 */
importScripts("/sw-rules.js");

var R = self.RoxSW;

/** Cachea una página offline (sin cookies: no puede traer datos de un usuario) y sus JS/CSS. */
function precachePage(path) {
  return fetch(path, { credentials: "omit", cache: "no-store" }).then(function (res) {
    if (!R.isCacheableResponse(res)) return;
    return res
      .clone()
      .text()
      .then(function (html) {
        var assets = R.assetUrlsFromHtml(html);
        return Promise.all([
          caches.open(R.PAGES_CACHE).then(function (c) {
            return c.put(path, res);
          }),
          caches.open(R.STATIC_CACHE).then(function (c) {
            return Promise.all(
              assets.map(function (url) {
                return c.match(url).then(function (hit) {
                  if (hit) return;
                  return fetch(url, { credentials: "omit" }).then(function (r) {
                    if (R.isCacheableResponse(r)) return c.put(url, r);
                  });
                });
              }),
            );
          }),
        ]);
      });
  });
}

function precacheAll() {
  return Promise.all(
    R.PRECACHE_PAGES.map(function (p) {
      return precachePage(p).catch(function () {
        /* sin red al instalar: se reintenta con el mensaje "warm" */
      });
    }),
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(precacheAll().then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          R.staleCaches(names).map(function (n) {
            return caches.delete(n);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "warm") event.waitUntil(precacheAll());
  if (data.type === "version" && event.ports && event.ports[0]) event.ports[0].postMessage({ version: R.SW_VERSION });
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  var kind = R.classify({ method: req.method, url: req.url, mode: req.mode, headers: req.headers }, self.location.origin);
  if (kind === "ignore") return;

  if (kind === "navigation") {
    event.respondWith(
      fetch(req).catch(function () {
        var redirect = R.offlineRedirect(req.url);
        if (redirect) return Response.redirect(redirect, 302);
        var fallback = R.fallbackFor(new URL(req.url).pathname);
        return caches.open(R.PAGES_CACHE).then(function (c) {
          return c.match(fallback, { ignoreSearch: true }).then(function (hit) {
            return (
              hit ||
              c.match(R.OFFLINE_PAGE, { ignoreSearch: true }).then(function (page) {
                return (
                  page ||
                  new Response("<!doctype html><meta charset=utf-8><title>Sin conexión</title><p>Sin conexión. Vuelve a intentarlo cuando tengas red.</p>", {
                    status: 503,
                    headers: { "Content-Type": "text/html; charset=utf-8" },
                  })
                );
              })
            );
          });
        });
      }),
    );
    return;
  }

  // Estáticos: primero caché; si no está, red (y se guarda solo si es cacheable).
  event.respondWith(
    caches.open(R.STATIC_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (R.isCacheableResponse(res)) c.put(req, res.clone());
          return res;
        });
      });
    }),
  );
});
