import { randomBytes } from "node:crypto";
import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expect as baseExpect, test, OFFLINE_NETWORK_ERRORS } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { collectErrors, dbQuery, e2eEnv, horizontalOverflow, loginViaUi, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

/**
 * Ejecución sin conexión (fase 11). Cada prueba crea su PROPIO coach y atleta;
 * la conexión se corta con context.setOffline(true). Borrar al coach elimina en
 * cascada sesiones, asignaciones, registros y operaciones.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const SLED = "00000000-0000-4000-8000-000000000004";
const PULL = "00000000-0000-4000-8000-000000000005";
const WALL = "00000000-0000-4000-8000-000000000010";

const snapshot = (rest: number) => ({
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
        { exerciseId: SLED, name: "Sled Push", category: "estaciones", equipment: [], sets: 3, targetType: "distance", reps: null, distanceMeters: 12, durationSeconds: null, loadKg: 80, restSeconds: rest, notes: null },
        { exerciseId: WALL, name: "Wall Balls", category: "estaciones", equipment: [], sets: 2, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: null, restSeconds: null, notes: null },
      ],
    },
  ],
});

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

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
  const email = `${role}.offline.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, name, email, password };
}

/** Coach + atleta activo + sesión de hoy asignada. Devuelve ids. */
async function setup(rest = 3) {
  const coach = await createUser("coach", "Coach Offline");
  const athlete = await createUser("athlete", `Atleta Offline ${Math.random().toString(36).slice(2, 6)}`);
  await dbQuery(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active')`, [coach.id, athlete.id]);
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, snapshot) values (gen_random_uuid(), $1, 'Sesión Offline', $2, $3) returning id`,
    [coach.id, today(), JSON.stringify(snapshot(rest))],
  );
  data.sessions.push(s!.id);
  const [a] = await dbQuery<{ id: string }>(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2) returning id`, [s!.id, athlete.id]);
  return { coach, athlete, sessionId: s!.id, assignmentId: a!.id };
}

async function loggedIn(browser: Browser, user: { email: string; password: string }, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] }, viewport });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

async function start(page: Page, sessionId: string) {
  await page.goto(`/atleta/sesiones/${sessionId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/ejecutar$`));
  await page.waitForLoadState("networkidle");
}

const logger = (page: Page) => page.getByRole("form", { name: /^Registrar serie/ });
/** Estado de envío de la ejecución (no el aviso general de conexión del shell). */
const status = (page: Page) => page.getByRole("main").getByRole("status").filter({ hasText: /^(En línea|Sin conexión|Guardado|Sincroniza|Error)/ }).first();

async function completeSet(page: Page) {
  await logger(page).getByRole("button", { name: /Completar serie|Guardar corrección/ }).click();
}

async function skipRest(page: Page) {
  await page.getByRole("button", { name: "Siguiente serie" }).click();
}

const setsOf = (assignmentId: string) =>
  dbQuery<{ set_number: number; exercise_index: number; client_op_id: string | null; recorded_at: string | null; actual_load_kg: number | null }>(
    `select s.set_number, s.exercise_index, s.client_op_id, s.recorded_at::text, s.actual_load_kg from set_logs s join session_logs l on l.id = s.session_log_id where l.assignment_id = $1 order by s.exercise_index, s.set_number`,
    [assignmentId],
  );

/**
 * Hace fallar las Server Actions (POST) de UNA sesión mientras `gate.blocked`
 * sea true: simula un servidor caído con el navegador "en línea".
 */
async function blockSync(ctx: BrowserContext, sessionId: string) {
  const gate = { blocked: true };
  await ctx.route(`**/atleta/sesiones/${sessionId}/**`, (route) => (gate.blocked && route.request().method() === "POST" ? route.abort("failed") : route.fallback()));
  return gate;
}

test.describe("ejecución sin conexión", () => {
  // Estas pruebas cortan la red a propósito: el navegador registra los recursos que no pudo descargar.
  test.beforeEach(({ consoleGuard }) => consoleGuard.allow(...OFFLINE_NETWORK_ERRORS));

  test("online y offline: la serie se ve al instante, sobrevive a recargar sin red y se sincroniza sin duplicar", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await start(page, sessionId);

    // Online: la serie llega al servidor con su operación idempotente.
    await completeSet(page);
    await expect(status(page)).toHaveText("Sincronizado");
    await skipRest(page);
    let rows = await setsOf(assignmentId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_op_id).toBeTruthy();
    expect(rows[0]!.recorded_at).toBeTruthy();

    // Sin conexión: se guarda localmente y se ve de inmediato.
    await ctx.setOffline(true);
    await expect(status(page)).toContainText("Sin conexión");
    await expect(logger(page).getByText("Serie 2 de 3")).toBeVisible();
    await logger(page).getByLabel(/Distancia real/).fill("11");
    await completeSet(page);
    await expect(status(page)).toContainText("Guardado localmente · 1 pendiente");
    await expect(page.getByText("2 de 5 series")).toBeVisible();
    expect(await setsOf(assignmentId)).toHaveLength(1);

    // Recargar sin red: el navegador no puede cargar la página, pero los datos siguen en el dispositivo.
    await page.reload().catch(() => undefined);
    await ctx.setOffline(false);
    await page.goto(`/atleta/sesiones/${sessionId}/ejecutar`, { waitUntil: "networkidle" });
    await expect(status(page)).toHaveText("Sincronizado");
    rows = await setsOf(assignmentId);
    expect(rows.map((r) => r.set_number)).toEqual([1, 2]);
    // Sin duplicados: una operación por serie.
    const [ops] = await dbQuery<{ n: number }>(`select count(*)::int as n from execution_ops o join session_logs l on l.id = o.session_log_id where l.assignment_id = $1`, [assignmentId]);
    expect(ops!.n).toBe(2);
    await page.reload({ waitUntil: "networkidle" });
    expect(await setsOf(assignmentId)).toHaveLength(2);
    await ctx.close();
  });

  test("pausa y reanudación sin conexión, reintento manual y finalizar con registros pendientes", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await start(page, sessionId);

    await ctx.setOffline(true);
    await page.getByRole("button", { name: "Pausar" }).click();
    await expect(page.getByRole("heading", { name: "Sesión en pausa" })).toBeVisible();
    await page.waitForTimeout(2_500);
    await page.getByRole("button", { name: "Reanudar sesión" }).click();
    await completeSet(page);
    await expect(status(page)).toContainText("3 pendientes");

    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "¿Finalizar con series pendientes?" });
    await expect(confirm.getByText(/3 registros sin enviar; se enviarán antes de finalizar/)).toBeVisible();
    await confirm.getByRole("button", { name: "Sí, finalizar" }).click();
    await expect(page.getByRole("heading", { name: "Entrenamiento finalizado en este dispositivo" })).toBeVisible();
    await expect(page.getByText(/Se enviará en cuanto vuelva la conexión/)).toBeVisible();

    // Vuelve la red pero el servidor falla: queda pendiente y se puede reintentar a mano.
    const gate = await blockSync(ctx, sessionId);
    await ctx.setOffline(false);
    await expect(status(page)).toContainText("4 pendientes");
    const retry = page.getByRole("button", { name: "Reintentar envío" });
    await expect(retry).toBeEnabled();
    gate.blocked = false;
    // Si un reintento automático gana la carrera, el resultado es el mismo.
    await retry.click({ timeout: 3_000 }).catch(() => undefined);
    await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/resumen`));

    const [log] = await dbQuery<{ status: string; paused_seconds: number; paused: boolean }>(
      `select status, paused_seconds, paused_at is not null as paused from session_logs where assignment_id = $1`,
      [assignmentId],
    );
    expect(log).toMatchObject({ status: "completada", paused: false });
    // La pausa hecha sin conexión cuenta con la hora del dispositivo (≈ 2,5 s), no con la de la sincronización.
    expect(log!.paused_seconds).toBeGreaterThanOrEqual(2);
    expect(log!.paused_seconds).toBeLessThan(15);
    expect(await setsOf(assignmentId)).toHaveLength(1);
    await ctx.close();
  });

  test("conflicto: si la sesión ya finalizó, el dato se conserva y se explica; el atleta puede descartarlo", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    await start(page, sessionId);

    await ctx.setOffline(true);
    await completeSet(page);
    await expect(status(page)).toContainText("1 pendiente");
    // Mientras tanto, la sesión se finalizó en el servidor (p. ej. desde otro dispositivo).
    await dbQuery(`update session_logs set status = 'completada', finished_at = now(), paused_at = null where assignment_id = $1`, [assignmentId]);
    await ctx.setOffline(false);

    const panel = page.getByRole("region", { name: "1 dato sin enviar" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Serie 1 de Sled Push/)).toBeVisible();
    await expect(panel.getByText(/Conflicto: .*ya había finalizado/)).toBeVisible();
    await expect(status(page)).toContainText("Error de sincronización");
    expect(await setsOf(assignmentId)).toHaveLength(0); // no se sobrescribió nada

    await panel.getByRole("button", { name: /^Descartar/ }).click();
    await expect(panel).toHaveCount(0);
    await ctx.close();
  });

  test("sesión personalizada: sustitución y omisión funcionan sin conexión", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    await dbQuery(
      `insert into assignment_overrides (id, assignment_id, block_index, exercise_index, override_sets, override_load_kg, replacement_exercise_id, replacement_name, replacement_category, updated_at)
       values (gen_random_uuid(), $1, 0, 0, 2, 60, $2, 'Sled Pull', 'estaciones', now())`,
      [assignmentId, PULL],
    );
    await dbQuery(`insert into assignment_overrides (id, assignment_id, block_index, exercise_index, skipped, updated_at) values (gen_random_uuid(), $1, 0, 1, true, now())`, [assignmentId]);
    const { ctx, page } = await loggedIn(browser, athlete);
    await start(page, sessionId);

    await ctx.setOffline(true);
    await expect(logger(page).getByText("Sled Pull")).toBeVisible();
    await expect(logger(page).getByText("12 m · 60 kg")).toBeVisible();
    await expect(page.getByText(/Adaptado para ti · en lugar de Sled Push/)).toBeVisible();
    await expect(page.getByText("0 de 2 series")).toBeVisible(); // Wall Balls omitido no cuenta
    await completeSet(page);
    await skipRest(page);
    await completeSet(page);
    await expect(page.getByRole("heading", { name: "¡Registraste todas las series!" })).toBeVisible();
    await expect(status(page)).toContainText("2 pendientes");

    await ctx.setOffline(false);
    await expect(status(page)).toHaveText("Sincronizado");
    const rows = await setsOf(assignmentId);
    expect(rows.map((r) => [r.exercise_index, r.set_number, r.actual_load_kg])).toEqual([
      [0, 1, 60],
      [0, 2, 60],
    ]);
    await ctx.close();
  });

  test("temporizador: tras suspender o recargar, el descanso y el tiempo activo se recalculan desde la hora de inicio", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId } = await setup(30);
    const { ctx, page } = await loggedIn(browser, athlete);
    await page.clock.install();
    await start(page, sessionId);
    await completeSet(page);
    const rest = page.getByRole("region", { name: "Descanso" });
    await expect(rest).toBeVisible();

    // "Suspender" 20 s: el reloj avanza sin ticks; al volver, el descanso se calcula desde su inicio.
    await page.clock.fastForward("00:20");
    await expect(rest.getByLabel(/Tiempo restante: 00:(0\d|10)/)).toBeVisible();

    // Recargar: el descanso en curso se retoma (persistido con su hora de inicio).
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "Descanso" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Descanso" }).getByLabel(/Tiempo restante: 00:(0\d|10)/)).toBeVisible();
    await ctx.close();
  });

  test("no se filtran datos entre usuarios del mismo dispositivo", async ({ browser }) => {
    test.slow();
    const one = await setup();
    const two = await setup();
    const { ctx, page } = await loggedIn(browser, one.athlete);
    await start(page, one.sessionId);
    // A deja una serie pendiente (el servidor falla).
    await blockSync(ctx, one.sessionId); // sigue bloqueado: lo de A queda pendiente
    await completeSet(page);
    await expect(status(page)).toContainText("1 pendiente");

    // Cambia de usuario en el mismo navegador.
    await page.goto("/auth/salir");
    await loginViaUi(page, two.athlete.email, two.athlete.password);
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await start(page, two.sessionId);
    await expect(status(page)).toContainText("En línea");
    await expect(status(page)).not.toContainText("pendiente");
    expect(await setsOf(one.assignmentId)).toHaveLength(0); // B no envió nada de A
    expect(await setsOf(two.assignmentId)).toHaveLength(0);

    // Lo de A sigue guardado en el dispositivo, ligado a A.
    const local = await page.evaluate(
      () =>
        new Promise<{ userId: string }[]>((resolve) => {
          const req = indexedDB.open("roxcoach-ejecucion");
          req.onsuccess = () => {
            const all = req.result.transaction("ops").objectStore("ops").getAll();
            all.onsuccess = () => resolve(all.result as { userId: string }[]);
          };
        }),
    );
    expect(local.map((o) => o.userId)).toEqual([one.athlete.id]);
    await ctx.close();
  });

  test("responsive (320–1280) con pendientes y conflicto a la vista", async ({ browser }) => {
    test.slow();
    const { athlete, sessionId, assignmentId } = await setup();
    const { ctx, page } = await loggedIn(browser, athlete);
    const errors = collectErrors(page);
    await start(page, sessionId);
    await ctx.setOffline(true);
    await completeSet(page);
    await skipRest(page);
    await dbQuery(`update session_logs set status = 'completada', finished_at = now() where assignment_id = $1`, [assignmentId]);
    await ctx.setOffline(false);
    await expect(page.getByRole("region", { name: "1 dato sin enviar" })).toBeVisible();
    await ctx.setOffline(true);
    await completeSet(page);
    for (const vp of [
      { width: 320, height: 640 },
      { width: 360, height: 780 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(vp);
      expect(await horizontalOverflow(page), `sin scroll horizontal (${vp.width})`).toBeLessThanOrEqual(0);
      expect(await smallTargets(page), `áreas táctiles ≥ 44 px (${vp.width})`).toEqual([]);
      await page.screenshot({ path: `test-results/screens/${vp.width}/ejecucion_offline.png`, fullPage: true });
    }
    await ctx.setOffline(false);
    expect(errors.filter((e) => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/i.test(e))).toEqual([]);
    await ctx.close();
  });
});
