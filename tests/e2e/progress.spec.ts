import { randomBytes } from "node:crypto";
import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { COACH_STATE, collectErrors, dbQuery, e2eEnv, horizontalOverflow, loginViaUi, readSeedIds, smallTargets } from "./helpers";

/**
 * Progreso y métricas (fase 8). Cada prueba crea sus PROPIOS atletas con datos
 * reales (sesiones, ejecuciones, series y molestias insertadas respetando los
 * triggers), así los números son deterministas aunque otras pruebas en paralelo
 * agreguen atletas al coach compartido.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

const SLED = "00000000-0000-4000-8000-000000000004";
const WALL = "00000000-0000-4000-8000-000000000010";

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

const created: { prefixes: string[]; users: string[] } = { prefixes: [], users: [] };

test.afterEach(async () => {
  for (const prefix of created.prefixes.splice(0)) {
    // Avisos de la fase 9 ligados a estas sesiones (si no, quedarían como historial huérfano).
    await dbQuery(`delete from coach_alerts where session_id in (select id from scheduled_sessions where title like $1)`, [`${prefix}%`]);
    await dbQuery(`delete from scheduled_sessions where title like $1`, [`${prefix}%`]);
  }
  for (const id of created.users.splice(0)) {
    // Primero la relación (deja de ser atleta activo: la sincronización ya no genera avisos), luego sus avisos.
    await dbQuery(`delete from coach_athletes where athlete_id = $1`, [id]);
    await dbQuery(`delete from coach_alerts where athlete_id = $1 or coach_id = $1`, [id]);
    const { error } = await admin().auth.admin.deleteUser(id);
    if (error && !/not.*found/i.test(error.message)) throw new Error(`No se pudo borrar el usuario de prueba: ${error.message}`);
  }
});

const SNAPSHOT = {
  version: 1,
  templateName: "Estaciones",
  focus: null,
  intensity: "alta",
  estimatedMinutes: 40,
  blocks: [
    {
      name: "Estaciones",
      notes: null,
      exercises: [
        { exerciseId: SLED, name: "Sled Push", category: "estaciones", equipment: [], sets: 2, targetType: "distance", reps: null, distanceMeters: 50, durationSeconds: null, loadKg: 152, restSeconds: 60, notes: null },
        { exerciseId: WALL, name: "Wall Balls", category: "estaciones", equipment: [], sets: 1, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: null, restSeconds: null, notes: null },
      ],
    },
  ],
};

async function createUser(role: "coach" | "athlete", name: string) {
  const email = `${role}.prog8.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !data.user) throw error ?? new Error("No se creó el usuario");
  created.users.push(data.user.id);
  return { id: data.user.id, name, email, password };
}

async function newAthlete(name: string) {
  const user = await createUser("athlete", name);
  await dbQuery(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active')`, [readSeedIds().coachId, user.id]);
  return user;
}

async function loggedIn(browser: Browser, user: { email: string; password: string }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

interface SessionOpts {
  /** Días respecto a hoy (fecha programada). */
  offset: number;
  completed?: { sled: number[]; wall: number; rpe: number | null };
  started?: boolean;
  discomfort?: { zone: string; intensity: string };
  /** Se cancela DESPUÉS de completarla (no debe contar). */
  cancelAfter?: boolean;
}

/** Sesión del coach compartido con datos reales insertados respetando los triggers. */
async function addSession(prefix: string, athleteId: string, label: string, o: SessionOpts) {
  const date = today(o.offset);
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, snapshot) values (gen_random_uuid(), $1, $2, $3, $4) returning id`,
    [readSeedIds().coachId, `${prefix} ${label}`, date, JSON.stringify(SNAPSHOT)],
  );
  const [a] = await dbQuery<{ id: string }>(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2) returning id`, [s!.id, athleteId]);
  if (o.completed || o.started) {
    // Inicio a las 12:00 de México (18:00 UTC) del día programado; 40 min de trabajo.
    const startedAt = `${date}T18:00:00Z`;
    const [log] = await dbQuery<{ id: string }>(`insert into session_logs (id, assignment_id, started_at) values (gen_random_uuid(), $1, $2) returning id`, [a!.id, startedAt]);
    if (o.completed) {
      for (const [i, load] of o.completed.sled.entries()) {
        await dbQuery(
          `insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_distance_meters, actual_load_kg) values (gen_random_uuid(), $1, 0, 0, $2, 50, $3)`,
          [log!.id, i + 1, load],
        );
      }
      await dbQuery(`insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_reps) values (gen_random_uuid(), $1, 0, 1, 1, $2)`, [log!.id, o.completed.wall]);
      if (o.discomfort) {
        await dbQuery(
          `insert into discomfort_reports (id, session_log_id, zone, intensity, block_index, exercise_index, created_at) values (gen_random_uuid(), $1, $2, $3, 0, 0, $4)`,
          [log!.id, o.discomfort.zone, o.discomfort.intensity, `${date}T18:30:00Z`],
        );
      }
      await dbQuery(`update session_logs set status = 'completada', finished_at = $2, rpe = $3 where id = $1`, [log!.id, `${date}T18:40:00Z`, o.completed.rpe]);
    }
  }
  if (o.cancelAfter) await dbQuery(`update scheduled_sessions set status = 'cancelada', cancelled_at = now() where id = $1`, [s!.id]);
  return s!.id;
}

/**
 * Atleta con historial: 2 completadas (Sled 140→152 kg, Wall Balls 20→18, RPE 7 y 8,
 * una molestia), 1 no realizada y 1 completada que después se canceló (300 kg, RPE 1:
 * no debe aparecer). Adherencia esperada: 2 de 3 = 67 % (baja adherencia).
 */
async function athleteWithHistory(label: string) {
  const prefix = uniqueName(label);
  created.prefixes.push(prefix);
  const athlete = await newAthlete(`Atleta Progreso ${Math.random().toString(36).slice(2, 6)}`);
  await addSession(prefix, athlete.id, "uno", { offset: -5, completed: { sled: [135, 140], wall: 20, rpe: 7 } });
  await addSession(prefix, athlete.id, "dos", { offset: -2, completed: { sled: [152, 150], wall: 18, rpe: 8 }, discomfort: { zone: "rodilla", intensity: "leve" } });
  await addSession(prefix, athlete.id, "faltó", { offset: -3 });
  await addSession(prefix, athlete.id, "cancelada", { offset: -1, completed: { sled: [300], wall: 99, rpe: 1 }, cancelAfter: true });
  return { athlete, prefix };
}

test.describe("progreso del atleta", () => {
  test("con sesiones y resultados: adherencia, completadas, RPE, marcas, evolución y molestias reales", async ({ browser }) => {
    test.slow();
    const { athlete } = await athleteWithHistory("Historial");
    const { ctx, page } = await loggedIn(browser, athlete);
    const errors = collectErrors(page);

    await page.goto("/atleta/progreso", { waitUntil: "networkidle" });
    const adherence = page.getByRole("region", { name: "Adherencia" });
    await expect(adherence.getByText("67%")).toBeVisible();
    await expect(adherence.getByText("2 de 3 completadas")).toBeVisible();
    await expect(adherence.getByText("Últimos 30 días")).toBeVisible();

    const recent = page.getByRole("region", { name: /Sesiones completadas/ });
    await expect(recent.getByRole("definition").nth(0)).toHaveText("2"); // 7 días
    await expect(page.getByText("7.5", { exact: true })).toBeVisible(); // RPE promedio de 7 y 8
    await expect(page.getByText("1 h 20 min")).toBeVisible(); // 2 × 40 min

    // Marcas y evolución: la sesión cancelada (300 kg / 99 reps) no cuenta.
    const sledRecord = page.getByRole("listitem").filter({ hasText: "Sled Push" }).filter({ hasText: "Mayor carga ·" });
    await expect(sledRecord.getByText("152 kg")).toBeVisible();
    await expect(page.getByText("Subió de 140 kg a 152 kg · 2 sesiones")).toBeVisible();
    await expect(page.getByText("Bajó de 20 reps a 18 reps · 2 sesiones")).toBeVisible();
    await expect(page.getByText("300 kg")).toHaveCount(0);
    await expect(page.getByText("99 reps")).toHaveCount(0);
    await expect(page.getByText(/El ritmo y el mejor tiempo en distancia no se muestran/)).toBeVisible();

    await expect(page.getByText("Molestia leve · Rodilla")).toBeVisible();

    // Periodo de 7 días: la no realizada (hace 3 días) y las completadas siguen dentro.
    await page.getByRole("link", { name: "Últimos 7 días" }).click();
    await expect(page).toHaveURL(/periodo=7/);
    await expect(page.getByRole("region", { name: "Adherencia" }).getByText("Últimos 7 días")).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("sin datos: sin asignaciones muestra cómo empezar; con asignaciones sin completar pide la primera sesión", async ({ browser }) => {
    test.slow();
    const prefix = uniqueName("SinDatos");
    created.prefixes.push(prefix);
    const empty = await newAthlete(`Atleta Vacío ${Math.random().toString(36).slice(2, 6)}`);
    const fresh = await newAthlete(`Atleta Nuevo ${Math.random().toString(36).slice(2, 6)}`);
    await addSession(prefix, fresh.id, "futura", { offset: 2 });

    const a = await loggedIn(browser, empty);
    await a.page.goto("/atleta/progreso");
    await expect(a.page.getByText("Aún no tienes sesiones asignadas").filter({ visible: true }).first()).toBeVisible();
    await expect(a.page.getByRole("link", { name: "Ver mi agenda" })).toBeVisible();
    await a.ctx.close();

    const b = await loggedIn(browser, fresh);
    await b.page.goto("/atleta/progreso");
    await expect(b.page.getByText("Completa tu primera sesión")).toBeVisible();
    await expect(b.page.getByRole("link", { name: "Ir a mi entrenamiento" })).toBeVisible();
    await expect(b.page.getByRole("region", { name: "Adherencia" }).getByText("Aún no hay datos suficientes")).toBeVisible();
    // Aislamiento entre atletas: no ve nada de otro atleta.
    await expect(b.page.getByText(/Molestia (leve|moderada|fuerte)/)).toHaveCount(0);
    await b.ctx.close();
  });
});

test.describe("progreso del coach", () => {
  test.use({ storageState: COACH_STATE });

  test("ve a sus atletas con datos reales, filtra y abre el detalle", async ({ page }) => {
    test.slow();
    const { athlete } = await athleteWithHistory("Coach");
    const errors = collectErrors(page);

    await page.goto(`/coach/progreso?atleta=${athlete.id}&periodo=30`, { waitUntil: "networkidle" });
    const adherence = page.getByRole("region", { name: "Adherencia" });
    await expect(adherence.getByText("67%")).toBeVisible();
    await expect(adherence.getByText("2 de 3 completadas")).toBeVisible();
    const row = page.getByRole("link", { name: `Ver progreso de ${athlete.name}` });
    await expect(row.getByText("Baja adherencia")).toBeVisible();
    await expect(row.getByText("1 molestia")).toBeVisible();
    await expect(page.getByRole("region", { name: "Requieren atención" })).toBeVisible();

    // Filtros por estado (sobre todo el equipo): aparece en "baja" y en "molestias".
    for (const estado of ["baja", "molestias"]) {
      await page.goto(`/coach/progreso?periodo=30&estado=${estado}`);
      await expect(page.getByRole("link", { name: `Ver progreso de ${athlete.name}` })).toBeVisible();
    }
    // Un atleta del filtro que no es del coach se ignora (no se confía en la URL).
    await page.goto(`/coach/progreso?atleta=00000000-0000-4000-8000-000000000099`);
    await expect(page.getByRole("region", { name: "Adherencia del grupo" })).toBeVisible();

    // Detalle por atleta.
    await page.goto(`/coach/progreso/${athlete.id}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1, name: athlete.name })).toBeVisible();
    await expect(page.getByText("Subió de 140 kg a 152 kg · 2 sesiones")).toBeVisible();
    await expect(page.getByText("300 kg")).toHaveCount(0);
    const planned = page.getByRole("region", { name: "Planeado vs. realizado" });
    await expect(planned.getByRole("link")).toHaveCount(2); // la cancelada no aparece
    await planned.getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/coach/sesiones/[0-9a-f-]{36}/atletas/${athlete.id}$`));
    expect(errors).toEqual([]);
  });

  test("filtros en mobile dentro de un panel inferior", async ({ page }) => {
    test.slow();
    const { athlete } = await athleteWithHistory("Filtro");
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/coach/progreso", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Filtros/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filtrar progreso" });
    await sheet.getByLabel("Atleta").selectOption(athlete.id);
    await sheet.getByLabel("Periodo").selectOption("90");
    await sheet.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(page).toHaveURL(new RegExp(`periodo=90.*atleta=${athlete.id}`));
    await expect(page.getByRole("region", { name: "Adherencia" }).getByText("Últimos 90 días")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Filtros \(2\)/ })).toBeVisible();
  });
});

test.describe("aislamiento y estados", () => {
  test("otro coach no ve atletas ni datos ajenos", async ({ browser }) => {
    test.slow();
    const { athlete } = await athleteWithHistory("Aislado");
    const coach2 = await createUser("coach", "Coach Ajeno Progreso");
    const c2 = await loggedIn(browser, coach2);
    await c2.page.goto("/coach/progreso");
    await expect(c2.page.getByText("Todavía no tienes atletas")).toBeVisible();
    await c2.page.goto(`/coach/progreso?atleta=${athlete.id}`);
    await expect(c2.page.getByText(athlete.name)).toHaveCount(0);
    await c2.page.goto(`/coach/progreso/${athlete.id}`);
    await expect(c2.page.getByText("Este atleta no está en tu equipo")).toBeVisible();
    await c2.ctx.close();
  });

  test("sin sesión, las pantallas de progreso redirigen al login", async ({ page }) => {
    for (const path of ["/atleta/progreso", "/coach/progreso", `/coach/progreso/${readSeedIds().athleteId}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("responsive (320–1280) y estados de carga, error y vacío", async ({ browser }) => {
    test.slow();
    const { athlete } = await athleteWithHistory("Pantallas");
    const a = await loggedIn(browser, athlete);
    const coachCtx = await browser.newContext({ baseURL: BASE_URL, storageState: COACH_STATE, locale: "es-MX", timezoneId: "America/Mexico_City" });
    const coach = await coachCtx.newPage();
    const errors = [...[collectErrors(a.page)], ...[collectErrors(coach)]];

    for (const vp of [
      { width: 320, height: 640 },
      { width: 360, height: 780 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await a.page.setViewportSize(vp);
      await coach.setViewportSize(vp);
      await a.page.goto("/atleta/progreso", { waitUntil: "networkidle" });
      await expect(a.page.getByRole("region", { name: "Adherencia" })).toBeVisible();
      await checkScreen(a.page, `${vp.width}/progreso_atleta_datos`);
      await coach.goto(`/coach/progreso?atleta=${athlete.id}`, { waitUntil: "networkidle" });
      await expect(coach.getByRole("region", { name: "Adherencia" })).toBeVisible();
      await checkScreen(coach, `${vp.width}/progreso_coach_datos`);
      await coach.goto(`/coach/progreso/${athlete.id}`, { waitUntil: "networkidle" });
      await expect(coach.getByRole("heading", { level: 1, name: athlete.name })).toBeVisible();
      await checkScreen(coach, `${vp.width}/progreso_coach_atleta`);
    }

    for (const [state, text] of [
      ["cargando", /Cargando/],
      ["error", /No pudimos cargar/],
      ["vacio", /Sin sesiones asignadas/],
    ] as const) {
      await coach.goto(`/coach/progreso/${athlete.id}?estado=${state}`, { waitUntil: "networkidle" });
      await expect(coach.locator("main [role=status], main [role=alert]").filter({ hasText: text }).first()).toBeVisible();
    }
    for (const e of errors) expect(e).toEqual([]);
    await a.ctx.close();
    await coachCtx.close();
  });
});

async function checkScreen(page: Page, name: string) {
  expect(await horizontalOverflow(page), `sin scroll horizontal (${name})`).toBeLessThanOrEqual(0);
  expect(await smallTargets(page), `áreas táctiles ≥ 44 px (${name})`).toEqual([]);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}
