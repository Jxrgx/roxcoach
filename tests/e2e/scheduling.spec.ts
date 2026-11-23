import { randomBytes } from "node:crypto";
import { type Browser, type Page } from "@playwright/test";
import { expect as baseExpect, test, EXPECTED_DOCUMENT_404 } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { ATHLETE_STATE, COACH_STATE, collectErrors, dbQuery, e2eEnv, field, horizontalOverflow, loginViaUi, readSeedIds, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

const BASE_URL = "http://localhost:3100";

// Límite por acción: si algo no aparece, la prueba falla con el paso exacto en
// vez de esperar hasta el límite total de la prueba.
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
// Con workers en paralelo el servidor tarda más en renderizar; 5 s no siempre alcanza.
const expect = baseExpect.configure({ timeout: 15_000 });
const SYS = { carrera: "00000000-0000-4000-8000-000000000001", sledPush: "00000000-0000-4000-8000-000000000004" };

/** "Hoy" en la zona horaria de la app (igual que el servidor). */
function today(offsetDays = 0): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function mondayOf(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function uniqueName(label: string) {
  return `E2E ${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Plantilla PUBLICADA de prueba con dos bloques (Running y Sled Push). */
async function insertPublishedTemplate(name: string, coachId = readSeedIds().coachId) {
  const [t] = await dbQuery<{ id: string }>(
    `insert into workout_templates (id, coach_id, name, focus, intensity, estimated_minutes, status)
     values (gen_random_uuid(), $1, $2, 'Potencia y resistencia', 'alta', 65, 'publicada') returning id`,
    [coachId, name],
  );
  const [b1] = await dbQuery<{ id: string }>(`insert into workout_blocks (id, template_id, position, name) values (gen_random_uuid(), $1, 0, 'Running') returning id`, [t!.id]);
  const [b2] = await dbQuery<{ id: string }>(`insert into workout_blocks (id, template_id, position, name) values (gen_random_uuid(), $1, 1, 'Sled Push') returning id`, [t!.id]);
  await dbQuery(
    `insert into block_exercises (id, block_id, exercise_id, position, sets, target_type, distance_meters, rest_seconds) values (gen_random_uuid(), $1, $2, 0, 4, 'distance', 1000, 90)`,
    [b1!.id, SYS.carrera],
  );
  await dbQuery(
    `insert into block_exercises (id, block_id, exercise_id, position, sets, target_type, distance_meters, load_kg, rest_seconds) values (gen_random_uuid(), $1, $2, 0, 4, 'distance', 50, 152, 120)`,
    [b2!.id, SYS.sledPush],
  );
  data.templates.push(t!.id);
  return t!.id;
}

/**
 * Datos creados por la prueba en curso, por id exacto (tests/e2e/cleanup.ts). Se
 * limpian en afterEach, que se ejecuta incluso si la prueba falla o agota el tiempo.
 */
let data: TestData;
test.beforeEach(() => {
  data = new TestData();
});

test.afterEach(async () => {
  // Las sesiones programadas por la UI salen de una plantilla de ESTA prueba: se
  // ubican por su template_id exacto (antes de borrar la plantilla, que lo pone en NULL).
  if (data.templates.length) {
    const rows = await dbQuery<{ id: string }>(`select id from scheduled_sessions where template_id = any($1::uuid[])`, [data.templates]);
    data.sessions.push(...rows.map((r) => r.id));
  }
  await data.cleanup();
});

async function createUser(role: "coach" | "athlete", name: string) {
  const email = `${role}.prog.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, email, password };
}


/**
 * Abre el acordeón de un bloque hasta ver su contenido. Un clic durante la
 * hidratación puede perderse (React vuelve a pintar el <details> cerrado),
 * así que se reintenta mientras siga cerrado.
 */
async function openBlock(page: Page, block: string, content: string) {
  const details = page.locator("details").filter({ hasText: block, visible: true }).first();
  await expect(async () => {
    if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
    await baseExpect(details.getByText(content)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function loggedIn(browser: Browser, user: { email: string; password: string }) {
  // storageState vacío explícito: browser.newContext() hereda el storageState
  // del test.use() del describe (aquí, la sesión del coach compartido).
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

async function athleteContext(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: ATHLETE_STATE, locale: "es-MX", timezoneId: "America/Mexico_City" });
  return { ctx, page: await ctx.newPage() };
}

function athleteOption(page: Page, name: string) {
  return page.locator("label").filter({ hasText: name }).filter({ visible: true });
}

/** Programa por la UI y devuelve el id de la sesión. */
async function scheduleViaUi(page: Page, templateId: string, opts: { title: string; date: string; time?: string; notes?: string; athletes: string[] }) {
  // networkidle: escribir antes de que React hidrate el formulario hace que el
  // estado inicial (fecha = hoy) reemplace lo escrito y la sesión se cree en otra fecha.
  await page.goto(`/coach/sesiones/nueva?plantilla=${templateId}`, { waitUntil: "networkidle" });
  await field(page, "Fecha").fill(opts.date);
  if (opts.time) await field(page, /^Hora de inicio/).fill(opts.time);
  await field(page, "Título").fill(opts.title);
  if (opts.notes) await field(page, /^Notas para los atletas/).fill(opts.notes);
  for (const name of opts.athletes) await athleteOption(page, name).click();
  // Se confirma lo escrito antes de enviar para fallar aquí y no con datos equivocados.
  await expect(field(page, "Fecha")).toHaveValue(opts.date);
  await expect(field(page, "Título")).toHaveValue(opts.title);
  await page.getByRole("button", { name: "Programar sesión" }).click();
  await expect(page).toHaveURL(/\/coach\/sesiones\/[0-9a-f-]{36}\?creada=1$/);
  return page.url().match(/sesiones\/([0-9a-f-]{36})/)![1]!;
}

test.describe("programación y asignación", () => {
  test.use({ storageState: COACH_STATE });

  test("flujo completo: plantilla publicada → programar → el atleta la ve en su inicio, agenda y detalle", async ({ page, browser }) => {
    test.slow(); // varios contextos de navegador (coach y atleta)
    const name = uniqueName("Engine");
    const templateId = await insertPublishedTemplate(name);
    await page.goto(`/coach/entrenamientos/${templateId}`);
    await page.getByRole("link", { name: "Programar" }).click();
    await expect(page).toHaveURL(new RegExp(`/coach/sesiones/nueva\\?plantilla=${templateId}$`));
    await expect(field(page, "Plantilla publicada")).toHaveValue(templateId);
    await expect(field(page, "Título")).toHaveValue(name);
    await expect(field(page, "Fecha")).toHaveValue(today());

    // Validación en cliente: sin atletas.
    await page.getByRole("button", { name: "Programar sesión" }).click();
    await expect(page.getByText("Elige al menos un atleta.")).toBeVisible();

    const title = `${name} martes`;
    await field(page, /^Hora de inicio/).fill("00:01");
    await field(page, "Título").fill(title);
    await field(page, /^Notas para los atletas/).fill("Llega 10 minutos antes.");
    await athleteOption(page, "Atleta Pruebas").click();
    await page.getByRole("button", { name: "Programar sesión" }).click();

    await expect(page).toHaveURL(/\/coach\/sesiones\/[0-9a-f-]{36}\?creada=1$/);
    const sessionId = page.url().match(/sesiones\/([0-9a-f-]{36})/)![1]!;
    await expect(page.getByText(/Sesión programada\. Tus atletas ya la ven/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: /Atletas asignados/ }).getByText("Atleta Pruebas")).toBeVisible();
    await expect(page.getByText("4 × 1 km · descanso 01:30").filter({ visible: true })).toBeVisible();

    // Calendario del coach: aparece hoy.
    await page.goto("/coach/calendario");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();

    // El atleta: inicio (entrenamiento de hoy), agenda y detalle.
    const athlete = await athleteContext(browser);
    await athlete.page.goto("/atleta/inicio");
    await expect(athlete.page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    await athlete.page.getByRole("link", { name: "Comenzar entrenamiento" }).click();
    await expect(athlete.page).toHaveURL(new RegExp(`/atleta/sesiones/${sessionId}$`));
    await expect(athlete.page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(athlete.page.getByText("Llega 10 minutos antes.").filter({ visible: true })).toBeVisible();
    // Los bloques están en acordeones cerrados (información de nivel 3): se abren ambos.
    await openBlock(athlete.page, "Sled Push", "4 × 50 m · 152 kg · descanso 02:00");
    await openBlock(athlete.page, "Running", "4 × 1 km · descanso 01:30");
    // Se verifica el destino del enlace y se navega a él: hacer clic mientras el
    // acordeón termina de abrirse deja el elemento "no estable" en máquinas cargadas.
    const exerciseLink = athlete.page.getByRole("link", { name: /Carrera 1 km: .* Ver ejercicio/ });
    await expect(exerciseLink).toHaveAttribute("href", `/atleta/ejercicios/${SYS.carrera}`);
    await athlete.page.goto(`/atleta/ejercicios/${SYS.carrera}`);
    await expect(athlete.page.getByRole("heading", { level: 1, name: "Carrera 1 km" })).toBeVisible();

    await athlete.page.goto("/atleta/agenda");
    await expect(athlete.page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await athlete.ctx.close();
  });

  test("el snapshot queda congelado aunque la plantilla cambie después", async ({ page, browser }) => {
    const name = uniqueName("Congelada");
    const templateId = await insertPublishedTemplate(name);
    const sessionId = await scheduleViaUi(page, templateId, { title: `${name} sesión`, date: today(3), athletes: ["Atleta Pruebas"] });
    await dbQuery(`update block_exercises set sets = 9 where block_id in (select id from workout_blocks where template_id = $1)`, [templateId]);
    await dbQuery(`update workout_templates set name = $2, estimated_minutes = 120 where id = $1`, [templateId, `${name} editada`]);

    await page.goto(`/coach/sesiones/${sessionId}`);
    await expect(page.getByText("4 × 1 km · descanso 01:30").filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/9 ×/)).toHaveCount(0);

    const athlete = await athleteContext(browser);
    await athlete.page.goto(`/atleta/sesiones/${sessionId}`);
    await expect(athlete.page.getByText("1 h 5 min").filter({ visible: true })).toBeVisible();
    await athlete.ctx.close();
  });

  test("editar detalles y cancelar: el atleta ve los cambios", async ({ page, browser }) => {
    const name = uniqueName("Editable");
    const templateId = await insertPublishedTemplate(name);
    const sessionId = await scheduleViaUi(page, templateId, { title: `${name} original`, date: today(4), athletes: ["Atleta Pruebas"] });

    await page.getByRole("button", { name: "Editar detalles" }).click();
    const dialog = page.getByRole("dialog", { name: "Editar detalles" });
    await dialog.getByLabel("Título").fill(`${name} renombrada`);
    await dialog.getByLabel(/^Hora de inicio/).fill("18:30");
    await dialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Sesión actualizada")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: `${name} renombrada` })).toBeVisible();

    const athlete = await athleteContext(browser);
    await athlete.page.goto(`/atleta/sesiones/${sessionId}`);
    await expect(athlete.page.getByRole("heading", { level: 1, name: `${name} renombrada` })).toBeVisible();
    await expect(athlete.page.getByText("· 18:30").filter({ visible: true })).toBeVisible();

    await page.getByRole("button", { name: "Cancelar sesión" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, cancelar sesión" }).click();
    await expect(page.getByText("Sesión cancelada", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar detalles" })).toHaveCount(0);

    await athlete.page.reload();
    await expect(athlete.page.getByText("Tu coach canceló esta sesión.").filter({ visible: true })).toBeVisible();
    await expect(athlete.page.getByRole("button", { name: "Comenzar" })).toHaveCount(0);
    await athlete.page.goto(`/atleta/agenda?semana=${mondayOf(today(4))}`);
    await expect(athlete.page.getByRole("link", { name: new RegExp(`${name} renombrada.*Cancelada`) })).toBeVisible();
    await athlete.ctx.close();
  });

  test("agregar y quitar atletas; los atletas en pausa no se pueden asignar", async ({ page, browser, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    test.slow(); // crea usuarios y abre sesión con un segundo atleta
    const name = uniqueName("Equipo");
    const templateId = await insertPublishedTemplate(name);
    const suffix = Math.random().toString(36).slice(2, 7);
    const secondName = `Atleta Segundo ${suffix}`;
    const pausedName = `Atleta En Pausa ${suffix}`;
    const second = await createUser("athlete", secondName);
    const paused = await createUser("athlete", pausedName);
    const coachId = readSeedIds().coachId;
    const [r1] = await dbQuery<{ id: string }>(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active') returning id`, [coachId, second.id]);
    const [r2] = await dbQuery<{ id: string }>(`insert into coach_athletes (id, coach_id, athlete_id, status, paused_at) values (gen_random_uuid(), $1, $2, 'paused', now()) returning id`, [coachId, paused.id]);
    data.relations.push(r1!.id, r2!.id);

    await page.goto(`/coach/sesiones/nueva?plantilla=${templateId}`, { waitUntil: "networkidle" });
    await expect(athleteOption(page, secondName)).toBeVisible();
    await expect(athleteOption(page, pausedName)).toHaveCount(0);

    const sessionId = await scheduleViaUi(page, templateId, { title: `${name} sesión`, date: today(5), athletes: ["Atleta Pruebas"] });
    await page.getByRole("button", { name: "Agregar atletas" }).click();
    const dialog = page.getByRole("dialog", { name: "Agregar atletas" });
    await dialog.locator("label").filter({ hasText: secondName }).click();
    await dialog.getByRole("button", { name: /^Agregar \(1\)$/ }).click();
    await expect(page.getByText("Atleta agregado")).toBeVisible();
    await expect(page.getByRole("region", { name: /Atletas asignados/ }).getByText(secondName)).toBeVisible();

    const other = await loggedIn(browser, second);
    await other.page.goto(`/atleta/sesiones/${sessionId}`);
    await expect(other.page.getByRole("heading", { level: 1, name: `${name} sesión` })).toBeVisible();

    await page.getByRole("button", { name: `Quitar a ${secondName} de la sesión` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sí, quitar" }).click();
    await expect(page.getByText(`${secondName} ya no está en esta sesión`)).toBeVisible();
    await other.page.reload();
    await expect(other.page.getByText("Esta sesión no está en tu agenda")).toBeVisible();
    await other.ctx.close();

    // Se conserva el historial: la asignación queda "retirada", no se borra.
    const [row] = await dbQuery<{ status: string }>(`select status from assignments where session_id = $1 and athlete_id = $2`, [sessionId, second.id]);
    expect(row?.status).toBe("retirada");

    // Integridad en la BD: no se puede asignar a un atleta en pausa.
    await expect(dbQuery(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2)`, [sessionId, paused.id])).rejects.toThrow(/atletas activos/);
  });

  test("validaciones: fecha pasada y sesión en la semana siguiente del calendario", async ({ page }) => {
    const name = uniqueName("Fechas");
    const templateId = await insertPublishedTemplate(name);
    await page.goto(`/coach/sesiones/nueva?plantilla=${templateId}`, { waitUntil: "networkidle" });
    await field(page, "Fecha").fill(today(-1));
    await athleteOption(page, "Atleta Pruebas").click();
    await page.getByRole("button", { name: "Programar sesión" }).click();
    await expect(page.getByText("La fecha no puede ser anterior a hoy.")).toBeVisible();

    const nextWeek = today(7);
    await scheduleViaUi(page, templateId, { title: `${name} próxima`, date: nextWeek, athletes: ["Atleta Pruebas"] });
    await page.goto("/coach/calendario");
    await page.getByRole("link", { name: "Semana siguiente" }).click();
    await expect(page).toHaveURL(new RegExp(`semana=${mondayOf(nextWeek)}`));
    await expect(page.getByRole("link", { name: new RegExp(`${name} próxima`) })).toBeVisible();
  });

  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 780 },
    { width: 1280, height: 800 },
  ]) {
    test(`detalle de sesión (coach y atleta) responsive en ${vp.width}px`, async ({ page, browser }) => {
      const name = uniqueName(`Responsive ${vp.width}`);
      const templateId = await insertPublishedTemplate(name);
      const sessionId = await scheduleViaUi(page, templateId, { title: `${name} sesión`, date: today(6), time: "07:00", notes: "Notas de prueba", athletes: ["Atleta Pruebas"] });
      const athlete = await athleteContext(browser);
      for (const [p, path, shot] of [
        [page, `/coach/sesiones/${sessionId}`, "sesion_coach"],
        [athlete.page, `/atleta/sesiones/${sessionId}`, "sesion_atleta"],
      ] as const) {
        await p.setViewportSize(vp);
        const errors = collectErrors(p);
        await p.goto(path, { waitUntil: "networkidle" });
        await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(p), `${path} sin scroll horizontal`).toBeLessThanOrEqual(0);
        expect(await smallTargets(p), `${path} áreas táctiles ≥ 44 px`).toEqual([]);
        expect(errors, `${path} sin errores de consola`).toEqual([]);
        await p.screenshot({ path: `test-results/screens/${vp.width}/${shot}.png`, fullPage: true });
      }
      await athlete.ctx.close();
    });
  }
});

test.describe("aislamiento de sesiones", () => {
  test("otro coach no ve la sesión ni puede programar sin plantillas; un atleta no asignado tampoco la ve", async ({ browser, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    test.slow(); // crea dos usuarios e inicia sesión con cada uno
    const name = uniqueName("Aislada");
    const templateId = await insertPublishedTemplate(name);
    const coach2 = await createUser("coach", "Coach Ajeno");
    const stranger = await createUser("athlete", "Atleta Ajeno");
    const [session] = await dbQuery<{ id: string }>(
      `insert into scheduled_sessions (id, coach_id, template_id, title, scheduled_date, snapshot)
       values (gen_random_uuid(), $1, $2, $3, $4, '{"version":1,"templateName":"x","focus":null,"intensity":"media","estimatedMinutes":30,"blocks":[]}') returning id`,
      [readSeedIds().coachId, templateId, `${name} sesión`, today(2)],
    );
    data.sessions.push(session!.id);
    await dbQuery(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2)`, [session!.id, readSeedIds().athleteId]);

    // Integridad: no se puede asignar a un atleta de otro coach (sin relación).
    await expect(dbQuery(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2)`, [session!.id, stranger.id])).rejects.toThrow(/atletas activos/);

    const c2 = await loggedIn(browser, coach2);
    await c2.page.goto(`/coach/sesiones/${session!.id}`);
    await expect(c2.page.getByText("Esta sesión no está en tu calendario")).toBeVisible();
    await c2.page.goto("/coach/sesiones/nueva");
    await expect(c2.page.getByText("Aún no tienes plantillas publicadas")).toBeVisible();
    await c2.ctx.close();

    const a2 = await loggedIn(browser, stranger);
    await a2.page.goto(`/atleta/sesiones/${session!.id}`);
    await expect(a2.page.getByText("Esta sesión no está en tu agenda")).toBeVisible();
    await a2.page.goto("/atleta/inicio");
    await expect(a2.page.getByText("Hoy no tienes entrenamiento asignado").first()).toBeVisible();
    await a2.ctx.close();
  });

  test("sin sesión, programar y los detalles redirigen al login", async ({ page }) => {
    for (const path of ["/coach/sesiones/nueva", "/coach/sesiones/00000000-0000-4000-8000-000000000001", "/atleta/sesiones/00000000-0000-4000-8000-000000000001"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });
});
