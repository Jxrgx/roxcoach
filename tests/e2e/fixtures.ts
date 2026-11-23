import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";

/**
 * `test` común de las e2e (fase 14): toda prueba falla si aparece un error real
 * de consola (`console.error`) o de página (excepción no capturada), en el
 * contexto por defecto y en los que la prueba cree con `browser.newContext()`.
 *
 * No hay filtro global: si una prueba provoca errores A PROPÓSITO (p. ej. corta
 * la red y el navegador registra "Failed to load resource"), los declara con
 * `consoleGuard.allow(/patrón/)` en esa prueba, con un comentario del motivo.
 */
export interface ConsoleGuard {
  /** Errores esperados por ESTA prueba. */
  allow(...patterns: RegExp[]): void;
}

function watch(ctx: BrowserContext, errors: string[]) {
  ctx.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location().url;
    errors.push(where ? `${m.text()} (${where})` : m.text());
  });
  ctx.on("weberror", (e) => errors.push(`Error de página: ${e.error().message}`));
}

export const test = base.extend<{ consoleGuard: ConsoleGuard }>({
  consoleGuard: [
    async ({ browser, context }, provide) => {
      const errors: string[] = [];
      const allowed: RegExp[] = [];
      watch(context, errors);
      // Los contextos que crea la prueba (otro usuario, otra pestaña) también se vigilan.
      const original = browser.newContext.bind(browser) as Browser["newContext"];
      browser.newContext = async (...args: Parameters<Browser["newContext"]>) => {
        const ctx = await original(...args);
        watch(ctx, errors);
        return ctx;
      };
      try {
        await provide({ allow: (...patterns) => allowed.push(...patterns) });
      } finally {
        browser.newContext = original;
      }
      const real = errors.filter((e) => !allowed.some((re) => re.test(e)));
      expect(real, "errores reales de consola o de página durante la prueba").toEqual([]);
    },
    { auto: true },
  ],
});

/**
 * Errores que el navegador registra cuando una prueba CORTA LA RED a propósito
 * (`context.setOffline(true)` o un `route.abort()` que simula el servidor caído):
 * recursos y payloads RSC que no se pudieron descargar, y el aviso de Next al
 * caer a navegación del navegador. Solo para las pruebas offline/PWA.
 */
export const OFFLINE_NETWORK_ERRORS = [
  /^Failed to load resource: net::ERR_INTERNET_DISCONNECTED /,
  /^Failed to load resource: net::ERR_FAILED /,
  /^Failed to fetch RSC payload for .+ Falling back to browser navigation/,
];

/**
 * Chromium registra en consola cada DOCUMENTO que responde 404. Desde el cierre
 * de la fase 14 un detalle inexistente o ajeno responde 404 real; las pruebas que
 * visitan uno a propósito lo declaran con este patrón.
 */
export const EXPECTED_DOCUMENT_404 = /^Failed to load resource: the server responded with a status of 404 /;

export { expect };
