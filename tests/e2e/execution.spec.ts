import { randomBytes } from "node:crypto";
import { type Browser, type Page } from "@playwright/test";
import { expect as baseExpect, test, EXPECTED_DOCUMENT_404 } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { COACH_STATE, collectErrors, dbQuery, e2eEnv, horizontalOverflow, loginViaUi, readSeedIds, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

/**
 * Ejecución del entrenamiento (fase 7).
 * Cada prueba crea su PROPIO atleta (vinculado al coach compartido) para no
 * dejar sesiones "en curso" en el atleta compartido, que otras pruebas en
 * paralelo revisan en su Inicio y su Agenda.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

const SYS = { carrera: "00000000-0000-4000-8000-000000000001", wallBalls: "00000000-0000-4000-8000-000000000010" };

function today(offsetDays = 0): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function uniqueName(label: string) {
  return `E2E ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * Datos creados por la prueba en curso, por id exacto (tests/e2e/cleanup.ts).
 * Borrar la sesión elimina en cascada asignaciones, registros, series y molestias;
 * los avisos se borran después por el id de sus asignaciones (sin carreras).
 */
let data: TestData;
test.beforeEach(() => {
  data = new TestData();
});
test.afterEach(() => data.cleanup());

/** Snapshot de prueba: 2 × 1 km (descanso 5 s) y 1 × 20 Wall Balls con 6 kg. */
const SNAPSHOT = {
  version: 1,
  templateName: "Engine corto",
  focus: "Resistencia",
  intensity: "media",
  estimatedMinutes: 30,
  blocks: [
    {
      name: "Running",
      notes: "Ritmo de carrera.",
      exercises: [
        { exerciseId: SYS.carrera, name: "Carrera 1 km", category: "carrera", equipment: [], sets: 2, targetType: "distance", reps: null, distanceMeters: 1000, durationSeconds: null, loadKg: null, restSeconds: 5, notes: null },
      ],
    },
    {
      name: "Estación",
      notes: null,
      exercises: [
        { exerciseId: SYS.wallBalls, name: "Wall Balls", category: "estaciones", equipment: ["Balón"], sets: 1, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: 6, restSeconds: null, notes: "Sentadilla completa" },
      ],
    },
  ],
};

/** Atleta nuevo, activo con el coach compartido, ya con sesión iniciada en el navegador. */
async function newAthlete(browser: Browser, name: string) {
  const email = `athlete.exec.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role: "athlete" } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  const [relation] = await dbQuery<{ id: string }>(
    `insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active') returning id`,
    [readSeedIds().coachId, created.user.id],
  );
  data.relations.push(relation!.id);
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await loginViaUi(page, email, password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { id: created.user.id, name, ctx, page };
}

/** Sesión del coach compartido asignada al atleta (insertada en la BD). */
async function insertSession(title: string, athleteId: string, opts: { date?: string; status?: "programada" | "cancelada" } = {}) {
  const status = opts.status ?? "programada";
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, status, cancelled_at, snapshot)
     values (gen_random_uuid(), $1, $2, $3, $4, ${status === "cancelada" ? "now()" : "null"}, $5) returning id`,
    [readSeedIds().coachId, title, opts.date ?? today(), status, JSON.stringify(SNAPSHOT)],
  );
  data.sessions.push(s!.id);
  await dbQuery(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2)`, [s!.id, athleteId]);
  return s!.id;
}

/** Abre la sesión y la comienza desde el detalle (espera la hidratación). */
async function start(page: Page, sessionId: string) {
  await page.goto(`/atleta/sesiones/${sessionId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Comenzar" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/ejecutar$`));
  await page.waitForLoadState("networkidle");
}

function logger(page: Page) {
  return page.getByRole("form", { name: /^Registrar serie/ });
}

test.describe("ejecución del atleta", () => {
  test("flujo completo: comenzar → series y descanso → finalizar → resumen, RPE, molestia → el coach ve los resultados", async ({ browser }) => {
    test.slow(); // crea un atleta, inicia sesión con él y con el coach
    const title = uniqueName("Ejecutar");
    const athlete = await newAthlete(browser, `Atleta Ejecuta ${Math.random().toString(36).slice(2, 6)}`);
    const sessionId = await insertSession(title, athlete.id);
    const { page } = athlete;
    const errors = collectErrors(page);

    await start(page, sessionId);
    await expect(page.getByText("Bloque 1 de 2 · Running")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progreso de la sesión" })).toBeVisible();
    let form = logger(page);
    await expect(form.getByText("Serie 1 de 2")).toBeVisible();
    await expect(form.getByText("1 km", { exact: true })).toBeVisible(); // planeado
    await form.getByRole("button", { name: "Completar serie" }).click();

    // Descanso planeado (5 s) y la siguiente serie.
    await expect(page.getByRole("region", { name: "Descanso" })).toBeVisible();
    await expect(page.getByText(/Siguiente: Carrera 1 km · Serie 2 de 2/)).toBeVisible();
    await page.getByRole("button", { name: "Siguiente serie" }).click();
    form = logger(page);
    await expect(form.getByText("Serie 2 de 2")).toBeVisible();
    await form.getByLabel(/Distancia real/).fill("950");
    await form.getByRole("button", { name: "Completar serie" }).click();
    await page.getByRole("button", { name: "Siguiente serie" }).click();

    // Wall Balls: prellenado con lo planeado; se registra lo real.
    form = logger(page);
    await expect(page.getByText("Bloque 2 de 2 · Estación")).toBeVisible();
    await expect(form.getByText("20 reps · 6 kg")).toBeVisible();
    await expect(form.getByLabel(/Carga real/)).toHaveValue("6");
    await form.getByLabel(/Repeticiones real/).fill("18");
    await form.getByRole("radio", { name: "RPE 8" }).check({ force: true });
    await form.getByRole("button", { name: "Completar serie" }).click();

    await expect(page.getByRole("heading", { name: "¡Registraste todas las series!" })).toBeVisible();
    await expect(page.getByText("3 de 3 series")).toBeVisible();

    // Molestia durante la sesión, ligada al ejercicio en curso.
    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("dialog", { name: "Más opciones" }).getByRole("button", { name: "Reportar molestia" }).click();
    const report = page.getByRole("dialog", { name: "Reportar molestia" });
    await report.getByLabel("Zona").selectOption("rodilla");
    await report.getByText("Leve", { exact: true }).click();
    await report.getByLabel(/^Nota/).fill("Molestia al bajar.");
    await report.getByRole("button", { name: "Enviar reporte" }).click();
    await expect(page.getByText("Molestia reportada")).toBeVisible();

    await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
    const confirm = page.getByRole("dialog", { name: "¿Finalizar entrenamiento?" });
    await confirm.getByRole("button", { name: "Sí, finalizar" }).click();
    await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/resumen\\?finalizada=1$`));
    await expect(page.getByText("¡Entrenamiento terminado!")).toBeVisible();
    await expect(page.getByText("3/3")).toBeVisible();
    await expect(page.getByText("Molestia leve · Rodilla")).toBeVisible();

    // RPE general y comentario.
    await page.waitForLoadState("networkidle");
    const feedback = page.getByRole("form", { name: "¿Cómo te fue?" });
    await feedback.getByRole("radio", { name: "RPE 7" }).check({ force: true });
    await feedback.getByLabel(/Comentario para tu coach/).fill("Buen ritmo en la carrera.");
    await feedback.getByRole("button", { name: "Enviar a mi coach" }).click();
    await expect(page.getByText("Enviado a tu coach")).toBeVisible();

    // Datos reales separados de lo planeado; el snapshot no cambió.
    const [row] = await dbQuery<{ status: string; rpe: number; comment: string; sets: number; snap: unknown }>(
      `select l.status, l.rpe, l.comment, (select count(*)::int from set_logs where session_log_id = l.id) as sets, s.snapshot as snap
       from session_logs l join assignments a on a.id = l.assignment_id join scheduled_sessions s on s.id = a.session_id where s.id = $1`,
      [sessionId],
    );
    expect(row).toMatchObject({ status: "completada", rpe: 7, comment: "Buen ritmo en la carrera.", sets: 3 });
    expect(row!.snap).toEqual(SNAPSHOT);
    const [wb] = await dbQuery<{ actual_reps: number; actual_load_kg: number; rpe: number }>(
      `select actual_reps, actual_load_kg, sl.rpe from set_logs sl join session_logs l on l.id = sl.session_log_id join assignments a on a.id = l.assignment_id
       where a.session_id = $1 and block_index = 1`,
      [sessionId],
    );
    expect(wb).toMatchObject({ actual_reps: 18, actual_load_kg: 6, rpe: 8 });

    // Finalizada: la ejecución redirige al resumen.
    await page.goto(`/atleta/sesiones/${sessionId}/ejecutar`);
    await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}/resumen$`));
    expect(errors).toEqual([]);
    await athlete.ctx.close();

    // Coach: estado, molestia y resultados; no puede quitar a quien ya la hizo.
    const coachCtx = await browser.newContext({ baseURL: BASE_URL, storageState: COACH_STATE, locale: "es-MX", timezoneId: "America/Mexico_City" });
    const coach = await coachCtx.newPage();
    await coach.goto(`/coach/sesiones/${sessionId}`);
    const assigned = coach.getByRole("region", { name: /Atletas asignados/ });
    await expect(assigned.getByText("1 de 1 completaron la sesión")).toBeVisible();
    await expect(assigned.getByText("Completada")).toBeVisible();
    await expect(assigned.getByText("1 molestia")).toBeVisible();
    await expect(assigned.getByRole("button", { name: `Quitar a ${athlete.name} de la sesión` })).toHaveCount(0);
    await assigned.getByRole("link", { name: `Ver resultados de ${athlete.name}` }).click();
    await expect(coach).toHaveURL(new RegExp(`/coach/sesiones/${sessionId}/atletas/${athlete.id}$`));
    await expect(coach.getByRole("heading", { level: 1, name: athlete.name })).toBeVisible();
    await expect(coach.getByText("Molestia leve · Rodilla")).toBeVisible();
    await expect(coach.getByText("Durante: Wall Balls")).toBeVisible();
    await expect(coach.getByText("Buen ritmo en la carrera.")).toBeVisible();
    await coach.getByText("Estación", { exact: true }).click();
    await expect(coach.getByText("18 reps · 6 kg · RPE 8")).toBeVisible();
    await coachCtx.close();

    // Integridad en la BD: no se retira a quien comenzó y no se registran series al terminar.
    await expect(dbQuery(`update assignments set status = 'retirada' where session_id = $1`, [sessionId])).rejects.toThrow(/ya comenzó/);
    await expect(
      dbQuery(
        `insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_reps)
         select gen_random_uuid(), l.id, 1, 0, 1, 5 from session_logs l join assignments a on a.id = l.assignment_id where a.session_id = $1
         on conflict (session_log_id, block_index, exercise_index, set_number) do update set actual_reps = 5`,
        [sessionId],
      ),
    ).rejects.toThrow(/en curso/);
  });

  test("pausar, recargar y continuar; finalizar con series pendientes", async ({ browser }) => {
    test.slow();
    const title = uniqueName("Pausa");
    const athlete = await newAthlete(browser, `Atleta Pausa ${Math.random().toString(36).slice(2, 6)}`);
    const sessionId = await insertSession(title, athlete.id);
    const { page } = athlete;

    await start(page, sessionId);
    await logger(page).getByRole("button", { name: "Completar serie" }).click();
    await expect(page.getByRole("region", { name: "Descanso" })).toBeVisible();

    await page.getByRole("button", { name: "Pausar" }).click();
    await expect(page.getByRole("heading", { name: "Sesión en pausa" })).toBeVisible();
    // La pausa vive en el servidor: sigue al recargar.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Sesión en pausa" })).toBeVisible();
    const [paused] = await dbQuery<{ paused: boolean }>(
      `select l.paused_at is not null as paused from session_logs l join assignments a on a.id = l.assignment_id where a.session_id = $1`,
      [sessionId],
    );
    expect(paused?.paused).toBe(true);

    await page.getByRole("button", { name: "Reanudar sesión" }).click();
    // Continúa en la siguiente serie pendiente.
    await expect(logger(page).getByText("Serie 2 de 2")).toBeVisible();
    await expect(page.getByText("1 de 3 series")).toBeVisible();

    // Volver a la serie 1 para corregirla.
    await page.getByRole("button", { name: "Serie 1, registrada" }).click();
    const form = logger(page);
    await expect(form.getByText("Serie 1 de 2")).toBeVisible();
    await form.getByLabel(/Distancia real/).fill("990");
    await form.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(logger(page).getByText("Serie 2 de 2")).toBeVisible();

    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "¿Finalizar con series pendientes?" });
    await expect(confirm.getByText(/faltan 2 series/)).toBeVisible();
    await confirm.getByRole("button", { name: "Sí, finalizar" }).click();
    await expect(page).toHaveURL(new RegExp(`/resumen\\?finalizada=1$`));
    await expect(page.getByText("1/3")).toBeVisible();
    await page.getByText("Running", { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText("Serie 1: 990 m").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("No realizada").filter({ visible: true }).first()).toBeVisible();

    const [log] = await dbQuery<{ status: string; paused: boolean; paused_seconds: number }>(
      `select l.status, l.paused_at is not null as paused, l.paused_seconds from session_logs l join assignments a on a.id = l.assignment_id where a.session_id = $1`,
      [sessionId],
    );
    expect(log).toMatchObject({ status: "completada", paused: false });
    expect(log!.paused_seconds).toBeGreaterThanOrEqual(0);

    // El detalle ahora ofrece el resumen, no "Comenzar".
    await page.goto(`/atleta/sesiones/${sessionId}`);
    await expect(page.getByRole("link", { name: "Ver resumen" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comenzar" })).toHaveCount(0);
    await athlete.ctx.close();
  });

  test("reglas: futuras y canceladas no se comienzan; otro atleta no accede; integridad en la BD", async ({ browser, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    test.slow();
    const athlete = await newAthlete(browser, `Atleta Reglas ${Math.random().toString(36).slice(2, 6)}`);
    const future = await insertSession(uniqueName("Futura"), athlete.id, { date: today(3) });
    const cancelled = await insertSession(uniqueName("Cancelada"), athlete.id, { status: "cancelada" });
    const late = await insertSession(uniqueName("Atrasada"), athlete.id, { date: today(-2) });
    const { page } = athlete;

    await page.goto(`/atleta/sesiones/${future}`);
    await expect(page.getByText(/Podrás comenzarla el/).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comenzar" })).toHaveCount(0);
    await page.goto(`/atleta/sesiones/${future}/ejecutar`);
    await expect(page).toHaveURL(new RegExp(`/atleta/sesiones/${future}$`));

    await page.goto(`/atleta/sesiones/${cancelled}`);
    await expect(page.getByText("Tu coach canceló esta sesión.").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Comenzar" })).toHaveCount(0);

    // Una sesión atrasada sí se puede recuperar.
    await start(page, late);
    await expect(logger(page)).toBeVisible();
    await athlete.ctx.close();

    // Otro atleta (el compartido) no ve ni ejecuta la sesión ajena.
    const other = await browser.newContext({ baseURL: BASE_URL, storageState: "tests/e2e/.auth/athlete.json", locale: "es-MX" });
    const otherPage = await other.newPage();
    for (const path of [`/atleta/sesiones/${late}/ejecutar`, `/atleta/sesiones/${late}/resumen`]) {
      await otherPage.goto(path);
      await expect(otherPage.getByText("Esta sesión no está en tu agenda")).toBeVisible();
    }
    await other.close();

    // BD: no se comienza una cancelada; no se registran series fuera del snapshot.
    await expect(
      dbQuery(`insert into session_logs (id, assignment_id) select gen_random_uuid(), id from assignments where session_id = $1`, [cancelled]),
    ).rejects.toThrow(/programadas y asignadas/);
    await expect(
      dbQuery(
        `insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_reps)
         select gen_random_uuid(), l.id, 1, 0, 2, 10 from session_logs l join assignments a on a.id = l.assignment_id where a.session_id = $1`,
        [late],
      ),
    ).rejects.toThrow(/no existe/);
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`ejecución, resumen y resultados del coach responsive en ${vp.width}px`, async ({ browser }) => {
      test.slow();
      const title = uniqueName(`Responsive ${vp.width}`);
      const athlete = await newAthlete(browser, `Atleta Pantalla ${Math.random().toString(36).slice(2, 6)}`);
      const sessionId = await insertSession(title, athlete.id);
      const { page } = athlete;
      await page.setViewportSize(vp);
      const errors = collectErrors(page);

      await start(page, sessionId);
      await expect(logger(page)).toBeVisible();
      await checkScreen(page, `${vp.width}/ejecucion`);
      await logger(page).getByRole("button", { name: "Completar serie" }).click();
      await expect(page.getByRole("region", { name: "Descanso" })).toBeVisible();
      await checkScreen(page, `${vp.width}/ejecucion_descanso`);

      await page.getByRole("button", { name: "Finalizar", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Sí, finalizar" }).click();
      await expect(page).toHaveURL(/\/resumen/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await checkScreen(page, `${vp.width}/ejecucion_resumen`);
      expect(errors).toEqual([]);
      await athlete.ctx.close();

      const coachCtx = await browser.newContext({ baseURL: BASE_URL, storageState: COACH_STATE, locale: "es-MX", viewport: vp });
      const coach = await coachCtx.newPage();
      const coachErrors = collectErrors(coach);
      await coach.goto(`/coach/sesiones/${sessionId}/atletas/${athlete.id}`, { waitUntil: "networkidle" });
      await expect(coach.getByRole("heading", { level: 1, name: athlete.name })).toBeVisible();
      await checkScreen(coach, `${vp.width}/resultados_coach`);
      await coach.goto(`/coach/sesiones/${sessionId}`, { waitUntil: "networkidle" });
      await checkScreen(coach, `${vp.width}/sesion_coach_estado`);
      expect(coachErrors).toEqual([]);
      await coachCtx.close();
    });
  }

  test("sin sesión, la ejecución, el resumen y los resultados redirigen al login", async ({ page }) => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const path of [`/atleta/sesiones/${id}/ejecutar`, `/atleta/sesiones/${id}/resumen`, `/coach/sesiones/${id}/atletas/${id}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});

async function checkScreen(page: Page, name: string) {
  expect(await horizontalOverflow(page), "sin scroll horizontal").toBeLessThanOrEqual(0);
  expect(await smallTargets(page), "áreas táctiles ≥ 44 px").toEqual([]);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}
