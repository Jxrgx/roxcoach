import { randomBytes } from "node:crypto";
import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expect as baseExpect, test, OFFLINE_NETWORK_ERRORS } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { collectErrors, dbQuery, e2eEnv, horizontalOverflow, loginViaUi, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

/**
 * PWA y recarga offline de la ejecución (fase 12). Corre contra el build de
 * producción (el service worker solo se registra en producción). Cada prueba
 * crea su PROPIO coach y atleta.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const SLED = "00000000-0000-4000-8000-000000000004";
const WALL = "00000000-0000-4000-8000-000000000010";
const SNAPSHOT = JSON.stringify({
  version: 1,
  templateName: "Estaciones",
  focus: null,
  intensity: "alta",
  estimatedMinutes: 40,
  blocks: [
    {
      name: "Empuje",
      notes: null,
      exercises: [
        { exerciseId: SLED, name: "Sled Push", category: "estaciones", equipment: [], sets: 3, targetType: "distance", reps: null, distanceMeters: 12, durationSeconds: null, loadKg: 80, restSeconds: 3, notes: null },
        { exerciseId: WALL, name: "Wall Balls", category: "estaciones", equipment: [], sets: 2, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: null, restSeconds: null, notes: null },
      ],
    },
  ],
});

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Datos creados por la prueba en curso, por id exacto (tests/e2e/cleanup.ts).
 * Todo cuelga del coach y atletas que crea la prueba: se borran sus sesiones
 * (cascada: asignaciones, registros, ajustes, ops), luego sus avisos y al final
 * los usuarios. Corre en afterEach aunque la prueba falle o agote el tiempo.
 */
let data: TestData;
test.beforeEach(() => {
  data = new TestData();
});
test.afterEach(() => data.cleanup());

async function createUser(role: "coach" | "athlete", name: string) {
  const email = `${role}.pwa.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, name, email, password };
}

async function setup() {
  const coach = await createUser("coach", "Coach PWA");
  const athlete = await createUser("athlete", `Atleta PWA ${Math.random().toString(36).slice(2, 6)}`);
  await dbQuery(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active')`, [coach.id, athlete.id]);
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, snapshot) values (gen_random_uuid(), $1, 'Sesión PWA', $2, $3) returning id`,
    [coach.id, today(), SNAPSHOT],
  );
  data.sessions.push(s!.id);
  const [a] = await dbQuery<{ id: string }>(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2) returning id`, [s!.id, athlete.id]);
  return { coach, athlete, sessionId: s!.id, assignmentId: a!.id };
}

async function loggedIn(browser: Browser, user: { email: string; password: string }, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] }, viewport, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

/** Espera a que el service worker esté activo, controle la página y haya precacheado el shell. */
async function swReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 20_000 });
  await page.waitForFunction(
    async () => {
      const keys = await caches.keys();
      for (const k of keys.filter((n) => n.startsWith("roxcoach-pages-"))) {
        const c = await caches.open(k);
        if ((await c.match("/offline/ejecucion")) && (await c.match("/sin-conexion"))) return true;
      }
      return false;
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function start(page: Page, sessionId: string) {
  await page.goto(`/atleta/sesiones/${sessionId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/ejecutar$`));
  await page.waitForLoadState("networkidle");
}

const logger = (page: Page) => page.getByRole("form", { name: /^Registrar serie/ });
const status = (page: Page) => page.getByRole("main").getByRole("status").filter({ hasText: /^(En línea|Sin conexión|Guardado|Sincroniza|Error)/ }).first();

const setsOf = (assignmentId: string) =>
  dbQuery<{ set_number: number }>(`select s.set_number from set_logs s join session_logs l on l.id = s.session_log_id where l.assignment_id = $1 order by s.exercise_index, s.set_number`, [assignmentId]);

async function blockSync(ctx: BrowserContext, sessionId: string) {
  const gate = { blocked: true };
  await ctx.route(`**/atleta/sesiones/${sessionId}/**`, (route) => (gate.blocked && route.request().method() === "POST" ? route.abort("failed") : route.fallback()));
  return gate;
}

test.describe("recarga sin conexión de la ejecución", () => {
  // Estas pruebas cortan la red a propósito: el navegador registra los recursos que no pudo descargar.
  test.beforeEach(({ consoleGuard }) => consoleGuard.allow(...OFFLINE_NETWORK_ERRORS));

  test("se restaura desde el dispositivo con sus pendientes, se puede seguir y sincroniza sin duplicados (con reintento manual)", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await swReady(page);
    await start(page, sessionId);

    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    await expect(status(page)).toHaveText("Sincronizado");
    await page.getByRole("button", { name: "Siguiente serie" }).click();

    await ctx.setOffline(true);
    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    await expect(status(page)).toContainText("1 pendiente");

    // Recargar SIN red: el service worker sirve el shell y se restaura desde IndexedDB.
    await page.reload();
    await expect(page.getByText("Restaurado desde el dispositivo")).toBeVisible();
    await expect(status(page)).toContainText("Guardado localmente · 1 pendiente");
    await expect(page.getByText("2 de 5 series")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Sesión PWA" })).toBeVisible();
    // Se puede seguir entrenando.
    await page.getByRole("button", { name: "Siguiente serie" }).click().catch(() => undefined);
    await expect(logger(page).getByText("Serie 3 de 3")).toBeVisible();
    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    await expect(status(page)).toContainText("2 pendientes");
    expect(await setsOf(assignmentId)).toHaveLength(1);

    // Vuelve la red pero el servidor falla: la ruta real carga y los pendientes siguen; reintento manual.
    const gate = await blockSync(ctx, sessionId);
    await ctx.setOffline(false);
    await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/ejecutar$`));
    await expect(status(page)).toContainText("2 pendientes");
    await expect(page.getByText("Restaurado desde el dispositivo")).toHaveCount(0);
    gate.blocked = false;
    await page.getByRole("button", { name: "Reintentar" }).click({ timeout: 5_000 }).catch(() => undefined);
    await expect(status(page)).toHaveText("Sincronizado");
    expect((await setsOf(assignmentId)).map((r) => r.set_number)).toEqual([1, 2, 3]);
    const [ops] = await dbQuery<{ n: number }>(`select count(*)::int as n from execution_ops o join session_logs l on l.id = o.session_log_id where l.assignment_id = $1`, [assignmentId]);
    expect(ops!.n).toBe(3);
    await ctx.close();
  });
});

test.describe("finalizar, rutas offline y privacidad", () => {
  // Estas pruebas cortan la red a propósito: el navegador registra los recursos que no pudo descargar.
  test.beforeEach(({ consoleGuard }) => consoleGuard.allow(...OFFLINE_NETWORK_ERRORS));

  test("finalizar sin conexión tras recargar: resumen local y sincronización al volver la red", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await swReady(page);
    await start(page, sessionId);
    await ctx.setOffline(true);
    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    // "Guardado localmente" aparece cuando ya está en IndexedDB: recién entonces se recarga.
    await expect(status(page)).toContainText("1 pendiente");
    await page.reload();
    await expect(page.getByText("Restaurado desde el dispositivo")).toBeVisible();
    await expect(status(page)).toContainText("1 pendiente");

    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, finalizar" }).click();
    await expect(page.getByRole("heading", { name: "Entrenamiento finalizado en este dispositivo" })).toBeVisible();
    // Recargar otra vez sin red: sigue el resumen local con el reintento.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Entrenamiento finalizado en este dispositivo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar envío" })).toBeDisabled();

    await ctx.setOffline(false);
    await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/resumen`));
    const [log] = await dbQuery<{ status: string }>(`select status from session_logs where assignment_id = $1`, [assignmentId]);
    expect(log!.status).toBe("completada");
    expect(await setsOf(assignmentId)).toHaveLength(1);
    await ctx.close();
  });

  test("una ruta no disponible sin red muestra la página offline (con acceso al entrenamiento guardado)", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await swReady(page);
    await start(page, sessionId);
    await ctx.setOffline(true);

    for (const path of ["/atleta/progreso", "/coach/inicio", `/atleta/sesiones/${sessionId}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Esta pantalla necesita conexión" })).toBeVisible();
    }
    const saved = page.getByRole("link", { name: /Abrir entrenamiento guardado: Sesión PWA/ });
    await expect(saved).toBeVisible();
    await saved.click();
    await expect(page.getByText("Restaurado desde el dispositivo")).toBeVisible();

    // Una ejecución que nunca se abrió en este dispositivo: no se inventan datos (pestaña nueva:
    // ver la nota sobre navegaciones encadenadas sin red en la prueba responsive).
    const other = await ctx.newPage();
    await other.goto("/atleta/sesiones/00000000-0000-4000-8000-000000000123/ejecutar");
    await expect(other.getByText("Esta sesión no está guardada en este dispositivo. Conéctate para abrirla.")).toBeVisible();
    await ctx.close();
  });

  test("cerrar sesión borra los datos privados del dispositivo y A no recupera nada de B", async ({ browser }) => {
    test.slow();
    const a = await setup();
    const b = await setup();
    const { ctx, page } = await loggedIn(browser, a.athlete);
    await swReady(page);
    await start(page, a.sessionId);
    // A deja un registro sin enviar.
    await blockSync(ctx, a.sessionId);
    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    await expect(status(page)).toContainText("1 pendiente");

    await page.goto("/atleta/perfil", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    const confirm = page.getByRole("dialog", { name: "¿Cerrar sesión con registros sin enviar?" });
    await expect(confirm.getByText(/1 registro de tu entrenamiento sin enviar/)).toBeVisible();
    await confirm.getByRole("button", { name: "Cerrar sesión y borrar" }).click();
    await expect(page).toHaveURL(/\/login/);

    const local = () =>
      page.evaluate(
        () =>
          new Promise<{ ops: { userId: string }[]; sessions: { userId: string }[]; meta: unknown[] }>((resolve) => {
            const req = indexedDB.open("roxcoach-ejecucion");
            req.onsuccess = () => {
              const tx = req.result.transaction(["ops", "sessions", "meta"]);
              const out = { ops: [] as { userId: string }[], sessions: [] as { userId: string }[], meta: [] as unknown[] };
              tx.objectStore("ops").getAll().onsuccess = (e) => (out.ops = (e.target as IDBRequest).result);
              tx.objectStore("sessions").getAll().onsuccess = (e) => (out.sessions = (e.target as IDBRequest).result);
              tx.objectStore("meta").getAll().onsuccess = (e) => (out.meta = (e.target as IDBRequest).result);
              tx.oncomplete = () => resolve(out);
            };
          }),
      );
    expect(await local()).toEqual({ ops: [], sessions: [], meta: [] });

    // Tras cerrar sesión, sin red, la ejecución de A ya no se puede restaurar.
    await ctx.setOffline(true);
    await page.goto(`/atleta/sesiones/${a.sessionId}/ejecutar`);
    await expect(page.getByText(/No hay un entrenamiento guardado en este dispositivo/)).toBeVisible();
    await ctx.setOffline(false);

    // B entra en el mismo dispositivo: solo existen sus datos; la ruta de A no restaura nada.
    await page.goto("/login");
    await loginViaUi(page, b.athlete.email, b.athlete.password);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await start(page, b.sessionId);
    await expect(status(page)).not.toContainText("pendiente");
    await expect.poll(async () => (await local()).sessions.map((s) => s.userId)).toEqual([b.athlete.id]);
    await ctx.setOffline(true);
    await page.goto(`/atleta/sesiones/${a.sessionId}/ejecutar`);
    await expect(page.getByText("Esta sesión no está guardada en este dispositivo. Conéctate para abrirla.")).toBeVisible();
    await expect(page.getByText("Sesión PWA")).toHaveCount(0);
    expect(await setsOf(a.assignmentId)).toHaveLength(0);
    await ctx.close();
  });
});

test.describe("service worker e instalación", () => {
  // Estas pruebas cortan la red a propósito: el navegador registra los recursos que no pudo descargar.
  test.beforeEach(({ consoleGuard }) => consoleGuard.allow(...OFFLINE_NETWORK_ERRORS));

  test("manifest válido, iconos y metadatos de instalación", async ({ page, request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ name: "RoxCoach", short_name: "RoxCoach", display: "standalone", orientation: "portrait", start_url: "/", scope: "/", theme_color: "#0b0d0f", background_color: "#0b0d0f" });
    const sizes = (m.icons as { sizes: string; purpose: string; type: string }[]).map((i) => `${i.sizes}:${i.purpose}:${i.type}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any:image/png", "512x512:any:image/png", "512x512:maskable:image/png"]));
    for (const icon of m.icons as { src: string; type: string }[]) {
      const r = await request.get(icon.src);
      expect(r.ok(), icon.src).toBe(true);
      expect(r.headers()["content-type"]).toContain(icon.type.split("+")[0]);
    }
    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]').first()).toHaveAttribute("href", /apple-icon/);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0b0d0f");
  });

  test("actualización: limpia cachés anteriores, toma el control y nunca guarda páginas privadas", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await swReady(page);
    await start(page, sessionId);
    await page.goto("/atleta/inicio", { waitUntil: "networkidle" });
    await page.goto("/atleta/progreso", { waitUntil: "networkidle" });

    const version = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const ch = new MessageChannel();
          ch.port1.onmessage = (e) => resolve((e.data as { version: string }).version);
          navigator.serviceWorker.controller!.postMessage({ type: "version" }, [ch.port2]);
        }),
    );
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);

    // Nada privado en caché: ni HTML de /atleta o /coach ni datos.
    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
      return urls;
    });
    expect(cached.filter((u) => /^\/(atleta|coach|login|registro|auth)/.test(u))).toEqual([]);
    expect(cached).toEqual(expect.arrayContaining(["/offline/ejecucion", "/sin-conexion"]));

    // Simula una versión anterior: una caché vieja de RoxCoach y otra ajena.
    await page.evaluate(async () => {
      await (await caches.open("roxcoach-static-2000-01-01.1")).put("/viejo.js", new Response("x"));
      await caches.open("otra-app");
      await (await navigator.serviceWorker.getRegistration())!.unregister();
    });
    await page.reload({ waitUntil: "networkidle" }); // PwaRegister instala la versión vigente
    await swReady(page);
    const names = await page.evaluate(() => caches.keys());
    expect(names).not.toContain("roxcoach-static-2000-01-01.1");
    expect(names).toContain("otra-app");
    expect(names).toEqual(expect.arrayContaining([`roxcoach-static-${version}`, `roxcoach-pages-${version}`]));
    await ctx.close();
  });

  test("responsive (320–1280): ejecución restaurada y página sin conexión", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    const errors = collectErrors(page);
    await swReady(page);
    await start(page, sessionId);
    await ctx.setOffline(true);
    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    await expect(status(page)).toContainText("1 pendiente");
    await page.reload();
    await expect(page.getByText("Restaurado desde el dispositivo")).toBeVisible();
    await page.close();
    // Cada pantalla en una pestaña nueva del mismo contexto (mismo SW e IndexedDB):
    // encadenar muchas navegaciones programáticas entre páginas offline en una sola
    // pestaña de Chromium sin red se aborta de forma intermitente (ver pendientes).
    for (const vp of [
      { width: 320, height: 640 },
      { width: 360, height: 780 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      for (const [path, check, name] of [
        [`/atleta/sesiones/${sessionId}/ejecutar`, "Restaurado desde el dispositivo", "pwa_restaurada"],
        ["/sin-conexion", "Esta pantalla necesita conexión", "pwa_sin_conexion"],
      ] as const) {
        const tab = await ctx.newPage();
        const tabErrors = collectErrors(tab);
        await tab.setViewportSize(vp);
        await tab.goto(path);
        await expect(tab.getByText(check).first()).toBeVisible();
        await checkScreen(tab, `${vp.width}/${name}`);
        expect(tabErrors.filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/i.test(e))).toEqual([]);
        await tab.close();
      }
    }
    await ctx.setOffline(false);
    expect(errors.filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/i.test(e))).toEqual([]);
    await ctx.close();
  });
});

async function checkScreen(page: Page, name: string) {
  expect(await horizontalOverflow(page), `sin scroll horizontal (${name})`).toBeLessThanOrEqual(0);
  expect(await smallTargets(page), `áreas táctiles ≥ 44 px (${name})`).toEqual([]);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}
