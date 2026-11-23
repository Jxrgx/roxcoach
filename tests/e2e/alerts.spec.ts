import { randomBytes } from "node:crypto";
import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ATHLETE_STATE, collectErrors, dbQuery, e2eEnv, horizontalOverflow, loginViaUi, smallTargets } from "./helpers";

/**
 * Avisos operativos (fase 9). Cada prueba crea su PROPIO coach y sus atletas:
 * así el número de avisos es exacto aunque otras pruebas generen eventos para
 * el coach compartido en paralelo.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

const SLED = "00000000-0000-4000-8000-000000000004";

function today(offsetDays = 0): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const createdUsers: string[] = [];

test.afterEach(async () => {
  // Borrar al coach elimina en cascada sus sesiones, asignaciones, registros y avisos.
  for (const id of createdUsers.splice(0)) {
    const { error } = await admin().auth.admin.deleteUser(id);
    if (error && !/not.*found/i.test(error.message)) throw new Error(`No se pudo borrar el usuario de prueba: ${error.message}`);
  }
});

const SNAPSHOT = JSON.stringify({
  version: 1,
  templateName: "Estaciones",
  focus: null,
  intensity: "alta",
  estimatedMinutes: 40,
  blocks: [
    {
      name: "Estaciones",
      notes: null,
      exercises: [{ exerciseId: SLED, name: "Sled Push", category: "estaciones", equipment: [], sets: 3, targetType: "distance", reps: null, distanceMeters: 50, durationSeconds: null, loadKg: 152, restSeconds: 60, notes: null }],
    },
  ],
});

async function createUser(role: "coach" | "athlete", name: string) {
  const email = `${role}.avisos.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !data.user) throw error ?? new Error("No se creó el usuario");
  createdUsers.push(data.user.id);
  return { id: data.user.id, name, email, password };
}

async function link(coachId: string, athleteId: string) {
  await dbQuery(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active')`, [coachId, athleteId]);
}

async function loggedIn(browser: Browser, user: { email: string; password: string }, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] }, viewport });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

/** Sesión del coach para el atleta, con ejecución real opcional (respetando los triggers). */
async function addSession(
  coachId: string,
  athleteId: string,
  title: string,
  o: { offset: number; done?: { sets: number; rpe: number | null }; discomfort?: { zone: string; intensity: string }; cancelAfter?: boolean },
) {
  const date = today(o.offset);
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, snapshot) values (gen_random_uuid(), $1, $2, $3, $4) returning id`,
    [coachId, title, date, SNAPSHOT],
  );
  const [a] = await dbQuery<{ id: string }>(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2) returning id`, [s!.id, athleteId]);
  if (o.done) {
    const started = new Date(Date.now() - 2 * 3600_000);
    const [log] = await dbQuery<{ id: string }>(`insert into session_logs (id, assignment_id, started_at) values (gen_random_uuid(), $1, $2) returning id`, [a!.id, started.toISOString()]);
    for (let n = 1; n <= o.done.sets; n++) {
      await dbQuery(`insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_distance_meters, actual_load_kg) values (gen_random_uuid(), $1, 0, 0, $2, 50, 150)`, [log!.id, n]);
    }
    if (o.discomfort) {
      await dbQuery(`insert into discomfort_reports (id, session_log_id, zone, intensity, block_index, exercise_index) values (gen_random_uuid(), $1, $2, $3, 0, 0)`, [log!.id, o.discomfort.zone, o.discomfort.intensity]);
    }
    await dbQuery(`update session_logs set status = 'completada', finished_at = now() - interval '1 hour', rpe = $2 where id = $1`, [log!.id, o.done.rpe]);
  }
  if (o.cancelAfter) await dbQuery(`update scheduled_sessions set status = 'cancelada', cancelled_at = now() where id = $1`, [s!.id]);
  return s!.id;
}

/**
 * Coach con un atleta activo y eventos reales:
 * - sesión completada con 1 de 3 series, RPE 9 y una molestia fuerte en el hombro;
 * - sesión de hace 2 días sin iniciar;
 * - sesión cancelada con RPE 10 y 0 series (no debe generar avisos).
 * Esperado: 4 avisos (molestia, incompleta, RPE alto, no iniciada).
 */
async function coachWithEvents() {
  const coach = await createUser("coach", "Coach Avisos");
  const athlete = await createUser("athlete", `Atleta Avisos ${Math.random().toString(36).slice(2, 6)}`);
  await link(coach.id, athlete.id);
  await addSession(coach.id, athlete.id, "Sesión Hombro", { offset: -1, done: { sets: 1, rpe: 9 }, discomfort: { zone: "hombro", intensity: "fuerte" } });
  await addSession(coach.id, athlete.id, "Sesión Olvidada", { offset: -2 });
  await addSession(coach.id, athlete.id, "Sesión Cancelada", { offset: -1, done: { sets: 1, rpe: 10 }, cancelAfter: true });
  return { coach, athlete };
}

const alertsList = (page: Page) => page.getByRole("list", { name: "Lista de avisos" });

test.describe("avisos del coach", () => {
  test("molestia, incompleta, RPE alto y no iniciada visibles y en orden; marcar uno y todos como leídos", async ({ browser }) => {
    test.slow();
    const { coach, athlete } = await coachWithEvents();
    const { ctx, page } = await loggedIn(browser, coach);
    const errors = collectErrors(page);

    await page.goto("/coach/avisos", { waitUntil: "networkidle" });
    await expect(page.getByText("4 avisos pendientes de tus atletas activos.")).toBeVisible();
    // Indicador en la navegación (barra lateral en desktop).
    await expect(page.getByRole("link", { name: "Avisos, 4 sin leer" })).toBeVisible();

    const items = alertsList(page).getByRole("article");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText("Molestia fuerte · Hombro");
    await expect(items.nth(0)).toContainText("Prioritaria");
    await expect(items.nth(0)).toContainText("no constituye un diagnóstico médico");
    await expect(items.nth(0)).toContainText(athlete.name);
    await expect(alertsList(page).getByText("Sesión finalizada incompleta")).toBeVisible();
    await expect(alertsList(page).getByText("Registró 1 de 3 series en \"Sesión Hombro\".")).toBeVisible();
    await expect(alertsList(page).getByText("RPE alto (9/10)")).toBeVisible();
    await expect(items.nth(3)).toContainText("Sesión no iniciada");
    await expect(items.nth(3)).toContainText("Seguimiento");
    await expect(page.getByText("Sesión Cancelada")).toHaveCount(0);
    await expect(page.getByText("RPE alto (10/10)")).toHaveCount(0);

    // El enlace lleva a los resultados del atleta en esa sesión.
    await expect(items.nth(0).getByRole("link", { name: /^Ver detalle/ })).toHaveAttribute("href", new RegExp(`/coach/sesiones/[0-9a-f-]{36}/atletas/${athlete.id}$`));

    // Marcar uno como leído: pasa a "Leídos" y baja el contador.
    await page.waitForLoadState("networkidle");
    await items.nth(0).getByRole("button", { name: /^Marcar leído/ }).click();
    await expect(page.getByText("3 avisos pendientes de tus atletas activos.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Avisos, 3 sin leer" })).toBeVisible();
    await page.goto("/coach/avisos?estado=leidos");
    await expect(alertsList(page).getByRole("article")).toHaveCount(1);
    await expect(alertsList(page).getByText("Molestia fuerte · Hombro")).toBeVisible();

    // Marcar todos como leídos.
    await page.goto("/coach/avisos", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Marcar todos como leídos" }).click();
    await expect(page.getByRole("heading", { name: "Todo en orden" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Avisos, sin avisos pendientes" })).toBeVisible();

    // Idempotente: volver a cargar (vuelve a sincronizar) no crea ni reabre avisos.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Todo en orden" })).toBeVisible();
    const [row] = await dbQuery<{ total: number; unread: number }>(
      `select count(*)::int as total, count(*) filter (where read_at is null)::int as unread from coach_alerts where coach_id = $1`,
      [coach.id],
    );
    expect(row).toEqual({ total: 4, unread: 0 });

    // Historial: los leídos siguen disponibles.
    await page.goto("/coach/avisos?estado=leidos");
    await expect(alertsList(page).getByRole("article")).toHaveCount(4);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("Inicio muestra solo los más importantes y el enlace a Ver todos; filtros por tipo", async ({ browser }) => {
    test.slow();
    const { coach } = await coachWithEvents();
    const { ctx, page } = await loggedIn(browser, coach);

    await page.goto("/coach/inicio", { waitUntil: "networkidle" });
    const summary = page.getByRole("region", { name: /Avisos \(4\)/ });
    await expect(summary.getByRole("article")).toHaveCount(3);
    await expect(summary.getByRole("article").first()).toContainText("Molestia fuerte · Hombro");
    await summary.getByRole("link", { name: "Ver todos" }).click();
    await expect(page).toHaveURL(/\/coach\/avisos$/);

    await page.goto("/coach/avisos?tipo=rpe_alto");
    await expect(alertsList(page).getByRole("article")).toHaveCount(1);
    await expect(alertsList(page).getByText("RPE alto (9/10)")).toBeVisible();
    await ctx.close();
  });

  test("mobile: campana con contador y filtros en un panel inferior", async ({ browser }) => {
    test.slow();
    const { coach } = await coachWithEvents();
    const { ctx, page } = await loggedIn(browser, coach, { width: 360, height: 780 });
    await page.goto("/coach/inicio", { waitUntil: "networkidle" });
    await page.getByRole("banner").getByRole("link", { name: "Avisos, 4 sin leer" }).click();
    await expect(page).toHaveURL(/\/coach\/avisos$/);
    await page.waitForLoadState("networkidle");
    // Un clic antes de que React hidrate el botón se pierde: se reintenta hasta ver el panel.
    const sheet = page.getByRole("dialog", { name: "Filtrar avisos" });
    await expect(async () => {
      if (!(await sheet.isVisible())) await page.getByRole("button", { name: /^Filtros/ }).click();
      await baseExpect(sheet).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await sheet.getByLabel("Tipo").selectOption("molestia");
    await sheet.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(/tipo=molestia/);
    await expect(alertsList(page).getByRole("article")).toHaveCount(1);
    await ctx.close();
  });
});

test.describe("aislamiento, permisos y estados", () => {
  test("cada coach ve solo avisos de sus atletas activos; un atleta no entra a la bandeja", async ({ browser }) => {
    test.slow();
    const { coach, athlete } = await coachWithEvents();
    const other = await createUser("coach", "Coach Ajeno Avisos");
    const otherAthlete = await createUser("athlete", "Atleta De Otro Coach");
    await link(other.id, otherAthlete.id);
    await addSession(other.id, otherAthlete.id, "Sesión Ajena", { offset: -1, done: { sets: 3, rpe: 10 }, discomfort: { zone: "rodilla", intensity: "leve" } });

    // El otro coach ve solo lo suyo (molestia + RPE 10), nada del primer coach.
    const o = await loggedIn(browser, other);
    await o.page.goto("/coach/avisos");
    await expect(alertsList(o.page).getByRole("article")).toHaveCount(2);
    await expect(o.page.getByText(athlete.name)).toHaveCount(0);
    await expect(o.page.getByText("Molestia fuerte · Hombro")).toHaveCount(0);
    await o.ctx.close();

    // El primer coach no ve al atleta ajeno.
    const c = await loggedIn(browser, coach);
    await c.page.goto("/coach/avisos");
    await expect(alertsList(c.page).getByRole("article")).toHaveCount(4);
    await expect(c.page.getByText("Atleta De Otro Coach")).toHaveCount(0);

    // Un atleta en pausa deja de mostrar sus avisos (se conservan en la BD).
    await dbQuery(`update coach_athletes set status = 'paused', paused_at = now() where coach_id = $1 and athlete_id = $2`, [coach.id, athlete.id]);
    await c.page.reload();
    await expect(c.page.getByRole("heading", { name: "Todo en orden" })).toBeVisible();
    const [kept] = await dbQuery<{ n: number }>(`select count(*)::int as n from coach_alerts where coach_id = $1`, [coach.id]);
    expect(kept?.n).toBe(4);
    await c.ctx.close();

    // Un atleta no puede ver la bandeja del coach.
    const a = await browser.newContext({ baseURL: BASE_URL, storageState: ATHLETE_STATE, locale: "es-MX" });
    const ap = await a.newPage();
    await ap.goto("/coach/avisos");
    await expect(ap).toHaveURL(/\/atleta\//);
    await a.close();
  });

  test("estado vacío útil para un coach sin avisos; sin sesión redirige al login", async ({ browser, page }) => {
    test.slow();
    const coach = await createUser("coach", "Coach Sin Avisos");
    const c = await loggedIn(browser, coach);
    await c.page.goto("/coach/avisos");
    await expect(c.page.getByRole("heading", { name: "Todo en orden" })).toBeVisible();
    await expect(c.page.getByRole("button", { name: "Marcar todos como leídos" })).toBeDisabled();
    await expect(c.page.getByRole("link", { name: "Avisos, sin avisos pendientes" })).toBeVisible();
    await c.page.goto("/coach/inicio");
    await expect(c.page.getByText("Sin avisos pendientes. Todo en orden con tus atletas.")).toBeVisible();
    await c.ctx.close();

    await page.goto("/coach/avisos");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("responsive (320–1280) y estados de carga y error", async ({ browser }) => {
    test.slow();
    const { coach } = await coachWithEvents();
    const { ctx, page } = await loggedIn(browser, coach);
    const errors = collectErrors(page);
    for (const vp of [
      { width: 320, height: 640 },
      { width: 360, height: 780 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto("/coach/avisos", { waitUntil: "networkidle" });
      await expect(alertsList(page).getByRole("article")).toHaveCount(4);
      await checkScreen(page, `${vp.width}/avisos`);
      await page.goto("/coach/inicio", { waitUntil: "networkidle" });
      await expect(page.getByRole("region", { name: /Avisos \(4\)/ })).toBeVisible();
      await checkScreen(page, `${vp.width}/avisos_inicio`);
    }
    for (const [state, text] of [
      ["cargando", /Cargando/],
      ["error", /No pudimos cargar/],
      ["sin-permisos", /No tienes acceso/],
    ] as const) {
      await page.goto(`/coach/avisos?estado=${state}`, { waitUntil: "networkidle" });
      await expect(page.locator("main [role=status], main [role=alert]").filter({ hasText: text }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

async function checkScreen(page: Page, name: string) {
  expect(await horizontalOverflow(page), `sin scroll horizontal (${name})`).toBeLessThanOrEqual(0);
  expect(await smallTargets(page), `áreas táctiles ≥ 44 px (${name})`).toEqual([]);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

/** Estado de los avisos "no iniciada" del coach, por título de sesión. */
async function missedAlerts(coachId: string) {
  return dbQuery<{ title: string; read: boolean; resolved: boolean; read_at: string | null }>(
    `select s.title, a.read_at is not null as read, a.resolved_at is not null as resolved, a.read_at::text
     from coach_alerts a join assignments asg on asg.id = a.source_id join scheduled_sessions s on s.id = asg.session_id
     where a.coach_id = $1 and a.kind = 'no_iniciada' order by s.title`,
    [coachId],
  );
}

test.describe("cierre de la fase 9", () => {
  test("'no iniciada' sale de pendientes al iniciar, completar o cancelar; sin duplicados y los leídos siguen leídos", async ({ browser }) => {
    test.slow();
    const coach = await createUser("coach", "Coach Resolución");
    const athlete = await createUser("athlete", `Atleta Resolución ${Math.random().toString(36).slice(2, 6)}`);
    await link(coach.id, athlete.id);
    const ids: Record<string, string> = {};
    for (const [label, offset] of [["S1 iniciar", -2], ["S2 completar", -3], ["S3 cancelar", -4], ["S4 leída", -5]] as const) {
      ids[label] = await addSession(coach.id, athlete.id, label, { offset });
    }
    const { ctx, page } = await loggedIn(browser, coach);
    const pendingCount = (n: number) => expect(page.getByText(n === 0 ? "No tienes avisos pendientes." : `${n} ${n === 1 ? "aviso pendiente" : "avisos pendientes"} de tus atletas activos.`)).toBeVisible();

    // 1. Aparecen las cuatro.
    await page.goto("/coach/avisos", { waitUntil: "networkidle" });
    await expect(alertsList(page).getByText("Sesión no iniciada")).toHaveCount(4);
    await pendingCount(4);

    // 2. Se lee una (S4).
    const s4 = alertsList(page).getByRole("article").filter({ hasText: "S4 leída" });
    await s4.getByRole("button", { name: /^Marcar leído/ }).click();
    await pendingCount(3);
    const [readBefore] = (await missedAlerts(coach.id)).filter((a) => a.title === "S4 leída");

    // 3. Iniciar S1 (registro en curso): sale de pendientes.
    const [asg1] = await dbQuery<{ id: string }>(`select id from assignments where session_id = $1`, [ids["S1 iniciar"]]);
    await dbQuery(`insert into session_logs (id, assignment_id, started_at) values (gen_random_uuid(), $1, now() - interval '1 hour')`, [asg1!.id]);
    await page.reload({ waitUntil: "networkidle" });
    await pendingCount(2);
    await expect(alertsList(page).getByText(/S1 iniciar/)).toHaveCount(0);

    // 4. Completar S2 con todas las series: sale de pendientes (sin otros avisos).
    const [asg2] = await dbQuery<{ id: string }>(`select id from assignments where session_id = $1`, [ids["S2 completar"]]);
    const [log2] = await dbQuery<{ id: string }>(`insert into session_logs (id, assignment_id, started_at) values (gen_random_uuid(), $1, now() - interval '2 hours') returning id`, [asg2!.id]);
    for (let n = 1; n <= 3; n++) await dbQuery(`insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_distance_meters) values (gen_random_uuid(), $1, 0, 0, $2, 50)`, [log2!.id, n]);
    await dbQuery(`update session_logs set status = 'completada', finished_at = now() - interval '1 hour' where id = $1`, [log2!.id]);
    await page.reload({ waitUntil: "networkidle" });
    await pendingCount(1);

    // 5. Cancelar S3 y S4: sin pendientes.
    await dbQuery(`update scheduled_sessions set status = 'cancelada', cancelled_at = now() where id = any($1::uuid[])`, [[ids["S3 cancelar"], ids["S4 leída"]]]);
    await page.reload({ waitUntil: "networkidle" });
    await pendingCount(0);
    await expect(page.getByRole("heading", { name: "Todo en orden" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Avisos, sin avisos pendientes" })).toBeVisible();

    // Historial: siguen en "Todos" como resueltos.
    await page.goto("/coach/avisos?estado=todos");
    await expect(alertsList(page).getByText("Resuelto")).toHaveCount(4);

    // Idempotencia: sincronizar varias veces no duplica, no reabre y no cambia el leído.
    await page.goto("/coach/avisos");
    await page.goto("/coach/inicio");
    const after = await missedAlerts(coach.id);
    expect(after.map((a) => [a.title, a.read, a.resolved])).toEqual([
      ["S1 iniciar", false, true],
      ["S2 completar", false, true],
      ["S3 cancelar", false, true],
      ["S4 leída", true, true],
    ]);
    expect(after.find((a) => a.title === "S4 leída")!.read_at).toBe(readBefore!.read_at);
    const [{ n }] = (await dbQuery<{ n: number }>(`select count(*)::int as n from coach_alerts where coach_id = $1`, [coach.id])) as [{ n: number }];
    expect(n).toBe(4);
    await ctx.close();
  });

  test("Inicio del coach usa datos reales (sin ficticios) y no muestra atletas de otro coach", async ({ browser }) => {
    test.slow();
    const { coach, athlete } = await coachWithEvents();
    const empty = await createUser("coach", "Coach Inicio Vacío");
    const c = await loggedIn(browser, coach);
    await c.page.goto("/coach/inicio", { waitUntil: "networkidle" });
    const pending = c.page.getByRole("region", { name: "Atletas con pendientes" });
    await expect(pending.getByRole("link", { name: `Ver progreso de ${athlete.name}` })).toContainText("1 sesión sin completar");
    const adherence = c.page.getByRole("region", { name: "Adherencia general" });
    // 1 completada de 2 vencidas (la cancelada no cuenta): 50 % con datos insuficientes.
    await expect(adherence.getByText("50%")).toBeVisible();
    await expect(adherence.getByText(/1 de 2 sesiones vencidas completadas/)).toBeVisible();
    await expect(adherence.getByText(/Datos insuficientes/)).toBeVisible();
    // Nombres de los datos ficticios anteriores.
    for (const fake of ["Luis A.", "Marco P.", "84%"]) await expect(c.page.getByText(fake)).toHaveCount(0);
    await c.ctx.close();

    const e = await loggedIn(browser, empty);
    await e.page.goto("/coach/inicio", { waitUntil: "networkidle" });
    await expect(e.page.getByText("Todavía no tienes atletas en tu equipo.")).toBeVisible();
    await expect(e.page.getByRole("region", { name: "Adherencia general" }).getByText("Aún no hay datos suficientes")).toBeVisible();
    await expect(e.page.getByText(athlete.name)).toHaveCount(0);
    await e.ctx.close();
  });
});
