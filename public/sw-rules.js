/*
 * Reglas del service worker de RoxCoach (fase 12). Funciones puras, sin
 * efectos: las usa public/sw.js (importScripts) y las prueba Vitest.
 *
 * Qué se cachea: el shell ESTÁTICO de la ejecución (/offline/ejecucion, sin
 * datos de ningún usuario), la página /sin-conexion, el JS/CSS con hash de
 * /_next/static, los iconos y el manifest.
 * Qué NUNCA se cachea: HTML de /atleta o /coach, respuestas con Set-Cookie o
 * Cache-Control private/no-store, peticiones que no sean GET, RSC, Server
 * Actions, Supabase ni otros orígenes.
 */
(function (root) {
  "use strict";

  /** Cambia en cada versión del service worker: invalida las cachés anteriores. */
  var SW_VERSION = "2026-11-29.1";
  var PREFIX = "roxcoach-";
  var STATIC_CACHE = PREFIX + "static-" + SW_VERSION;
  var PAGES_CACHE = PREFIX + "pages-" + SW_VERSION;
  var OFFLINE_SHELL = "/offline/ejecucion";
  var OFFLINE_PAGE = "/sin-conexion";
  var PRECACHE_PAGES = [OFFLINE_SHELL, OFFLINE_PAGE];
  var EXECUTION_RE = /^\/atleta\/sesiones\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/ejecutar\/?$/i;
  var STATIC_FILES = ["/manifest.webmanifest", "/icon.svg", "/apple-icon.png"];

  function currentCaches() {
    return [STATIC_CACHE, PAGES_CACHE];
  }

  /** Cachés de RoxCoach de versiones anteriores (las ajenas no se tocan). */
  function staleCaches(names) {
    var keep = currentCaches();
    return names.filter(function (n) {
      return n.indexOf(PREFIX) === 0 && keep.indexOf(n) === -1;
    });
  }

  function isStaticPath(pathname) {
    return pathname.indexOf("/_next/static/") === 0 || pathname.indexOf("/icons/") === 0 || STATIC_FILES.indexOf(pathname) !== -1;
  }

  function header(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] || headers[name.toLowerCase()] || null;
  }

  /**
   * Qué hacer con una petición: "navigation" (página completa: red y, solo si
   * falla, una página offline), "static" (primero caché) o "ignore" (no se toca).
   */
  function classify(req, origin) {
    if (!req || req.method !== "GET") return "ignore";
    var url;
    try {
      url = new URL(req.url);
    } catch {
      return "ignore";
    }
    if (url.origin !== origin) return "ignore";
    if (url.searchParams.has("_rsc") || header(req.headers, "RSC") || header(req.headers, "Next-Action")) return "ignore";
    if (req.mode === "navigate") return "navigation";
    if (isStaticPath(url.pathname)) return "static";
    return "ignore";
  }

  /** Página que se sirve si una navegación falla por falta de red. */
  function fallbackFor(pathname) {
    return pathname === OFFLINE_SHELL || EXECUTION_RE.test(pathname) ? OFFLINE_SHELL : OFFLINE_PAGE;
  }

  /**
   * A dónde llevar una navegación que falló sin red. Se REDIRIGE a la página
   * offline (con el contexto en la URL) en lugar de servirla con otra URL: así la
   * dirección siempre coincide con la página y el router de Next no se desfasa.
   * null = ya es una página offline: se sirve directo desde la caché.
   */
  function offlineRedirect(url) {
    var u = new URL(url);
    if (u.pathname === OFFLINE_SHELL || u.pathname === OFFLINE_PAGE) return null;
    if (EXECUTION_RE.test(u.pathname)) return OFFLINE_SHELL + "?sesion=" + u.pathname.split("/")[3];
    return OFFLINE_PAGE + "?desde=" + encodeURIComponent(u.pathname + u.search);
  }

  /** ¿Se puede guardar esta respuesta en una caché compartida? Nunca si es privada. */
  function isCacheableResponse(res) {
    if (!res || res.status !== 200 || (res.type && res.type !== "basic" && res.type !== "default")) return false;
    if (res.redirected) return false;
    if (header(res.headers, "Set-Cookie")) return false;
    var cc = String(header(res.headers, "Cache-Control") || "").toLowerCase();
    if (cc.indexOf("private") !== -1 || cc.indexOf("no-store") !== -1) return false;
    return true;
  }

  /** JS/CSS con hash que referencia el HTML de una página offline (para cachearlos junto con ella). */
  function assetUrlsFromHtml(html) {
    var out = [];
    var re = /(?:src|href)="(\/_next\/static\/[^"?#]+)"/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      if (out.indexOf(m[1]) === -1) out.push(m[1]);
    }
    return out;
  }

  root.RoxSW = {
    SW_VERSION: SW_VERSION,
    PREFIX: PREFIX,
    STATIC_CACHE: STATIC_CACHE,
    PAGES_CACHE: PAGES_CACHE,
    OFFLINE_SHELL: OFFLINE_SHELL,
    OFFLINE_PAGE: OFFLINE_PAGE,
    PRECACHE_PAGES: PRECACHE_PAGES,
    currentCaches: currentCaches,
    staleCaches: staleCaches,
    classify: classify,
    fallbackFor: fallbackFor,
    offlineRedirect: offlineRedirect,
    isCacheableResponse: isCacheableResponse,
    assetUrlsFromHtml: assetUrlsFromHtml,
  };
})(typeof self !== "undefined" ? self : globalThis);
