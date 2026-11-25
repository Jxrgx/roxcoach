import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ATHLETE_STATE, COACH_STATE } from "./helpers";

/**
 * Navegación entre módulos (fase 14). Cada pantalla tiene su estructura
 * (título) fuera de Suspense y sus datos dentro: al navegar, el título de
 * destino se ve aunque los datos sigan cargando.
 *
 * Para comprobarlo sin depender de la velocidad de la red se retrasa SOLO la
 * respuesta de la navegación (la que trae los datos); el prefetch del App Shell
 * no se toca. El fixture común falla si aparece cualquier error de consola.
 */

const DELAY_MS = 2_500;

/** Retrasa las respuestas RSC de navegación (no las de prefetch) a `path`. */
async function delayNavigationData(page: Page, path: string) {
  await page.route(
    (url) => url.pathname === path,
    async (route: Route) => {
      const h = route.request().headers();
      const isRsc = h["rsc"] === "1";
      const isPrefetch = Boolean(h["next-router-prefetch"] || h["next-router-segment-prefetch"]);
      if (isRsc && !isPrefetch) await new Promise((r) => setTimeout(r, DELAY_MS));
      await route.continue();
    },
  );
}

/** Estado de carga visible en <main>: un role="status" con esqueletos (los estados vacíos también usan status). */
const loading = (page: Page) => page.getByRole("main").getByRole("status").filter({ visible: true, has: page.locator(".animate-pulse") });

/** Enlace de la navegación (barra lateral, superior o inferior), fuera de <main>. */
const navLink = (page: Page, href: string) => page.locator(`a[href="${href}"]:not(main a)`).filter({ visible: true }).first();

const ATHLETE = [
  { href: "/atleta/perfil", title: "Perfil" },
  { href: "/atleta/progreso", title: "Progreso" },
  { href: "/atleta/agenda", title: "Agenda" },
  { href: "/atleta/mensajes", title: "Mensajes" },
];
const COACH = [
  { href: "/coach/atletas", title: "Atletas" },
  { href: "/coach/calendario", title: "Calendario" },
  { href: "/coach/biblioteca", title: "Biblioteca" },
  { href: "/coach/entrenamientos", title: "Entrenamientos" },
  { href: "/coach/avisos", title: "Avisos" },
];

for (const [role, state, home, routes] of [
  ["atleta", ATHLETE_STATE, "/atleta/inicio", ATHLETE],
  ["coach", COACH_STATE, "/coach/inicio", COACH],
] as const) {
  test.describe(`${role}: navegación instantánea entre módulos`, () => {
    test.use({ storageState: state, viewport: { width: 1280, height: 800 } });

    for (const r of routes) {
      test(`Inicio → ${r.title}: el título aparece antes que los datos`, async ({ page }) => {
        await page.goto(home, { waitUntil: "networkidle" });
        await delayNavigationData(page, r.href);
        const started = Date.now();
        await navLink(page, r.href).click();
        await page.waitForURL((u) => u.pathname === r.href);
        const heading = page.getByRole("main").getByRole("heading", { level: 1, name: r.title, exact: true });
        await expect(heading).toBeVisible({ timeout: DELAY_MS - 500 });
        expect(Date.now() - started, "el título no esperó a los datos").toBeLessThan(DELAY_MS);
        // Mientras tanto hay un estado de carga visible (no una pantalla vacía)…
        await expect(loading(page).first()).toBeVisible();
        // …y después llegan los datos y desaparece.
        await expect(loading(page)).toHaveCount(0, { timeout: 20_000 });
        await expect(heading).toBeVisible();
      });
    }

    test("recorrer todos los módulos seguidos no deja errores ni pantallas vacías", async ({ page }) => {
      await page.goto(home, { waitUntil: "networkidle" });
      for (const r of routes) {
        await navLink(page, r.href).click();
        await page.waitForURL((u) => u.pathname === r.href);
        await expect(page.getByRole("main").getByRole("heading", { level: 1, name: r.title, exact: true })).toBeVisible();
      }
      await navLink(page, home).click();
      await page.waitForURL((u) => u.pathname === home);
      await expect(page.getByRole("main").getByRole("heading", { level: 1, name: /^Hola,/ })).toBeVisible();
    });
  });
}

test.describe("sesión y rol durante la navegación", () => {
  test.use({ storageState: ATHLETE_STATE });

  test("sesión expirada: la siguiente navegación lleva al login conservando el destino", async ({ page, context }) => {
    await page.goto("/atleta/inicio", { waitUntil: "networkidle" });
    await context.clearCookies();
    await navLink(page, "/atleta/perfil").click();
    await expect(page).toHaveURL(/\/login\?next=%2Fatleta%2Fperfil$/);
  });

  test("rol incorrecto: un atleta que abre el panel del coach vuelve a su inicio", async ({ page }) => {
    await page.goto("/coach/atletas");
    await expect(page).toHaveURL(/\/atleta\/inicio$/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: /^Hola,/ })).toBeVisible();
  });
});
