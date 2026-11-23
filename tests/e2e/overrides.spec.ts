import { randomBytes } from "node:crypto";
import { type Browser, type Locator, type Page } from "@playwright/test";
import { expect as baseExpect, test, EXPECTED_DOCUMENT_404 } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { ATHLETE_STATE, collectErrors, dbQuery, e2eEnv, horizontalOverflow, loginViaUi, smallTargets } from "./helpers";
import { TestData } from "./cleanup";

/**
 * Personalización por atleta (fase 10). Cada prueba crea su PROPIO coach y dos
 * atletas activos; la sesión se inserta con un snapshot fijo. Borrar al coach
 * elimina en cascada sesiones, asignaciones, ajustes y registros.
 */

const BASE_URL = "http://localhost:3100";
test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
const expect = baseExpect.configure({ timeout: 15_000 });

const SLED = "00000000-0000-4000-8000-000000000004";
const WALL = "00000000-0000-4000-8000-000000000010";

const SNAPSHOT = {
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
        { exerciseId: SLED, name: "Sled Push", category: "estaciones", equipment: ["Trineo"], sets: 4, targetType: "distance", reps: null, distanceMeters: 12, durationSeconds: null, loadKg: 80, restSeconds: 5, notes: null },
        { exerciseId: WALL, name: "Wall Balls", category: "estaciones", equipment: ["Balón"], sets: 2, targetType: "reps", reps: 20, distanceMeters: null, durationSeconds: null, loadKg: 6, restSeconds: null, notes: null },
      ],
    },
  ],
};

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
  const email = `${role}.ajustes.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `E2e-${randomBytes(9).toString("base64url")}`;
  const { data: created, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role } });
  if (error || !created.user) throw error ?? new Error("No se creó el usuario");
  data.users.push(created.user.id);
  return { id: created.user.id, name, email, password };
}

async function loggedIn(browser: Browser, user: { email: string; password: string }, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ baseURL: BASE_URL, locale: "es-MX", timezoneId: "America/Mexico_City", storageState: { cookies: [], origins: [] }, viewport });
  const page = await ctx.newPage();
  await loginViaUi(page, user.email, user.password);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { ctx, page };
}

/** Coach con dos atletas activos y una sesión de hoy asignada a ambos. */
async function setup() {
  const suffix = Math.random().toString(36).slice(2, 6);
  const coach = await createUser("coach", "Coach Ajustes");
  const a = await createUser("athlete", `Ana Ajuste ${suffix}`);
  const b = await createUser("athlete", `Beto Original ${suffix}`);
  for (const athlete of [a, b]) {
    await dbQuery(`insert into coach_athletes (id, coach_id, athlete_id, status) values (gen_random_uuid(), $1, $2, 'active')`, [coach.id, athlete.id]);
  }
  const [s] = await dbQuery<{ id: string }>(
    `insert into scheduled_sessions (id, coach_id, title, scheduled_date, snapshot) values (gen_random_uuid(), $1, 'Sesión Ajustable', $2, $3) returning id`,
    [coach.id, today(), JSON.stringify(SNAPSHOT)],
  );
  data.sessions.push(s!.id);
  const assignment: Record<string, string> = {};
  for (const athlete of [a, b]) {
    const [r] = await dbQuery<{ id: string }>(`insert into assignments (id, session_id, athlete_id) values (gen_random_uuid(), $1, $2) returning id`, [s!.id, athlete.id]);
    assignment[athlete.id] = r!.id;
  }
  return { coach, a, b, sessionId: s!.id, assignment };
}

/** Abre el acordeón de un ejercicio en el editor (reintenta si el clic llega antes de hidratar). */
async function openExercise(page: Page, name: string): Promise<Locator> {
  // Por el título del acordeón (el contenido incluye los nombres de otros ejercicios en el selector).
  const details = page.locator("details").filter({ has: page.locator("summary", { hasText: name }) }).first();
  await expect(async () => {
    if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
    await baseExpect(details.getByText("Ajuste para este atleta")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return details;
}

/** Abre un bloque (acordeón) de las vistas del atleta o de resultados. */
async function openBlock(page: Page, name: string) {
  const details = page.locator("details").filter({ has: page.locator("summary", { hasText: name }), visible: true }).first();
  await expect(async () => {
    if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
    await baseExpect(details).toHaveAttribute("open", "", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const snapshotOf = async (sessionId: string) => (await dbQuery<{ snapshot: unknown }>(`select snapshot from scheduled_sessions where id = $1`, [sessionId]))[0]!.snapshot;
const overridesOf = (assignmentId: string) =>
  dbQuery<{ block_index: number; exercise_index: number; skipped: boolean; override_load_kg: number | null; replacement_name: string | null; note: string | null; created_by: string | null }>(
    `select block_index, exercise_index, skipped, override_load_kg, replacement_name, note, created_by from assignment_overrides where assignment_id = $1 order by block_index, exercise_index`,
    [assignmentId],
  );

test.describe("personalización por atleta", () => {
  test("personaliza a un solo atleta; el otro conserva el plan original y cada uno ve solo lo suyo", async ({ browser }) => {
    test.slow();
    const { coach, a, b, sessionId, assignment } = await setup();
    const c = await loggedIn(browser, coach);
    const errors = collectErrors(c.page);

    await c.page.goto(`/coach/sesiones/${sessionId}`, { waitUntil: "networkidle" });
    const assigned = c.page.getByRole("region", { name: /Atletas asignados/ });
    await expect(assigned.getByText(a.name)).toBeVisible();
    await expect(assigned.getByText(b.name)).toBeVisible();
    await assigned.getByRole("link", { name: `Personalizar para ${a.name}` }).click();
    await expect(c.page.getByRole("heading", { level: 1, name: `Personalizar para ${a.name}` })).toBeVisible();
    await c.page.waitForLoadState("networkidle");

    const sled = await openExercise(c.page, "Sled Push");
    await sled.getByLabel(/^Carga \(kg\)/).fill("60");
    const wall = await openExercise(c.page, "Wall Balls");
    await wall.getByLabel(/Omitir este ejercicio/).check();
    const summary = c.page.getByRole("region", { name: "Resumen de cambios" });
    await expect(summary.getByText("80 kg")).toBeVisible();
    await expect(summary.getByText("60 kg")).toBeVisible();
    await expect(summary.getByText("Ejercicio omitido")).toBeVisible();

    await c.page.getByRole("button", { name: "Guardar personalización" }).click();
    await expect(c.page).toHaveURL(new RegExp(`/coach/sesiones/${sessionId}$`));
    const rowA = assigned.getByRole("listitem").filter({ hasText: a.name });
    const rowB = assigned.getByRole("listitem").filter({ hasText: b.name });
    await expect(rowA.getByText("Personalizada")).toBeVisible();
    await expect(rowB.getByText("Personalizada")).toHaveCount(0);
    expect(errors).toEqual([]);

    // BD: el snapshot no cambió; los ajustes son solo de A y con auditoría.
    expect(await snapshotOf(sessionId)).toEqual(SNAPSHOT);
    const rows = await overridesOf(assignment[a.id]!);
    expect(rows.map((r) => [r.block_index, r.exercise_index, r.skipped, r.override_load_kg])).toEqual([
      [0, 0, false, 60],
      [0, 1, true, null],
    ]);
    expect(rows.every((r) => r.created_by === coach.id)).toBe(true);
    expect(await overridesOf(assignment[b.id]!)).toEqual([]);
    await c.ctx.close();

    // A ve su versión; B ve el original.
    const pa = await loggedIn(browser, a);
    await pa.page.goto(`/atleta/sesiones/${sessionId}`);
    await pa.page.waitForLoadState("networkidle");
    await openBlock(pa.page, "Empuje");
    await expect(pa.page.getByText("Adaptado para ti").filter({ visible: true }).first()).toBeVisible();
    await expect(pa.page.getByText("4 × 12 m · 60 kg").filter({ visible: true })).toBeVisible();
    await expect(pa.page.getByText("Ejercicio omitido").filter({ visible: true })).toBeVisible();
    await pa.ctx.close();

    const pb = await loggedIn(browser, b);
    await pb.page.goto(`/atleta/sesiones/${sessionId}`);
    await pb.page.waitForLoadState("networkidle");
    await openBlock(pb.page, "Empuje");
    await expect(pb.page.getByText("4 × 12 m · 80 kg").filter({ visible: true })).toBeVisible();
    await expect(pb.page.getByText("Adaptado para ti")).toHaveCount(0);
    await expect(pb.page.getByText("60 kg")).toHaveCount(0);
    await pb.ctx.close();
  });

  test("sustitución de ejercicio con motivo y restauración de los valores originales", async ({ browser }) => {
    test.slow();
    const { coach, a, sessionId, assignment } = await setup();
    const c = await loggedIn(browser, coach);
    const editor = `/coach/sesiones/${sessionId}/atletas/${a.id}/personalizar`;

    await c.page.goto(editor, { waitUntil: "networkidle" });
    const sled = await openExercise(c.page, "Sled Push");
    await sled.getByLabel("Ejercicio", { exact: true }).selectOption({ label: "Sled Pull" });
    // El título del acordeón ya muestra el ejercicio nuevo.
    const pulled = await openExercise(c.page, "Sled Pull");
    await pulled.getByLabel(/Motivo o nota para el atleta/).fill("Molestia en hombro");
    await expect(c.page.getByRole("region", { name: "Resumen de cambios" }).getByText("Sled Pull")).toBeVisible();
    await c.page.getByRole("button", { name: "Guardar personalización" }).click();
    await expect(c.page).toHaveURL(new RegExp(`/coach/sesiones/${sessionId}$`));
    let rows = await overridesOf(assignment[a.id]!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ replacement_name: "Sled Pull", note: "Molestia en hombro" });

    // Restaurar original (por ejercicio) y guardar: sin ajustes.
    await c.page.goto(editor, { waitUntil: "networkidle" });
    const again = await openExercise(c.page, "Sled Pull");
    await again.getByRole("button", { name: "Restaurar original" }).click();
    await expect(c.page.getByText(`Sin ajustes: ${a.name} verá el plan original.`)).toBeVisible();
    await c.page.getByRole("button", { name: "Guardar personalización" }).click();
    await expect(c.page).toHaveURL(new RegExp(`/coach/sesiones/${sessionId}$`));
    expect(await overridesOf(assignment[a.id]!)).toEqual([]);

    // Restaurar todo con confirmación.
    await dbQuery(`insert into assignment_overrides (id, assignment_id, block_index, exercise_index, override_sets, updated_at) values (gen_random_uuid(), $1, 0, 1, 1, now())`, [assignment[a.id]]);
    await c.page.goto(editor, { waitUntil: "networkidle" });
    await c.page.getByRole("button", { name: "Restaurar todo" }).click();
    await c.page.getByRole("dialog", { name: "¿Restaurar el plan original?" }).getByRole("button", { name: "Sí, restaurar todo" }).click();
    await expect(c.page).toHaveURL(new RegExp(`/coach/sesiones/${sessionId}$`));
    rows = await overridesOf(assignment[a.id]!);
    expect(rows).toEqual([]);
    expect(await snapshotOf(sessionId)).toEqual(SNAPSHOT);
    await c.ctx.close();
  });

  test("ejecución con valores personalizados, bloqueo al iniciar y resultados con original, ajuste y realizado", async ({ browser }) => {
    test.slow();
    const { coach, a, sessionId, assignment } = await setup();
    await dbQuery(
      `insert into assignment_overrides (id, assignment_id, block_index, exercise_index, override_sets, override_load_kg, note, updated_at) values (gen_random_uuid(), $1, 0, 0, 2, 60, 'Cuida la espalda', now())`,
      [assignment[a.id]],
    );
    await dbQuery(`insert into assignment_overrides (id, assignment_id, block_index, exercise_index, skipped, updated_at) values (gen_random_uuid(), $1, 0, 1, true, now())`, [assignment[a.id]]);

    const pa = await loggedIn(browser, a, { width: 360, height: 780 });
    await pa.page.goto(`/atleta/sesiones/${sessionId}`, { waitUntil: "networkidle" });
    await pa.page.getByRole("button", { name: "Comenzar" }).filter({ visible: true }).click();
    await expect(pa.page).toHaveURL(/\/ejecutar$/);
    await pa.page.waitForLoadState("networkidle");
    const logger = pa.page.getByRole("form", { name: /^Registrar serie/ });
    await expect(logger.getByText("Serie 1 de 2")).toBeVisible();
    await expect(logger.getByText("12 m · 60 kg")).toBeVisible();
    await expect(pa.page.getByText(/Adaptado para ti · Cuida la espalda/)).toBeVisible();
    await expect(pa.page.getByText("0 de 2 series")).toBeVisible(); // Wall Balls omitido no cuenta
    await logger.getByRole("button", { name: "Completar serie" }).click();
    await pa.page.getByRole("button", { name: "Siguiente serie" }).click();
    await pa.page.getByRole("form", { name: /^Registrar serie/ }).getByRole("button", { name: "Completar serie" }).click();
    await expect(pa.page.getByRole("heading", { name: "¡Registraste todas las series!" })).toBeVisible();
    await pa.ctx.close();

    // BD: bloqueado al iniciar (el trigger rechaza cambios) y no acepta series del omitido.
    await expect(dbQuery(`update assignment_overrides set override_load_kg = 50 where assignment_id = $1 and exercise_index = 0`, [assignment[a.id]])).rejects.toThrow(/bloqueada/);
    await expect(dbQuery(`delete from assignment_overrides where assignment_id = $1`, [assignment[a.id]])).rejects.toThrow(/bloqueada/);
    await expect(
      dbQuery(
        `insert into set_logs (id, session_log_id, block_index, exercise_index, set_number, actual_reps) select gen_random_uuid(), l.id, 0, 1, 1, 20 from session_logs l where l.assignment_id = $1`,
        [assignment[a.id]],
      ),
    ).rejects.toThrow(/omitido/);

    const c = await loggedIn(browser, coach);
    await c.page.goto(`/coach/sesiones/${sessionId}/atletas/${a.id}/personalizar`);
    await expect(c.page.getByText("El atleta ya comenzó la sesión: la personalización está bloqueada.")).toBeVisible();
    await expect(c.page.getByRole("button", { name: "Guardar personalización" })).toHaveCount(0);

    await c.page.goto(`/coach/sesiones/${sessionId}/atletas/${a.id}`);
    await c.page.waitForLoadState("networkidle");
    await openBlock(c.page, "Empuje");
    await expect(c.page.getByText("Plan original: Sled Push · 4 × 12 m · 80 kg")).toBeVisible();
    await expect(c.page.getByText("Ajuste para este atleta: 2 × 12 m · 60 kg")).toBeVisible();
    await expect(c.page.getByText("Serie 1: 12 m · 60 kg")).toBeVisible();
    await expect(c.page.getByText("Ejercicio omitido")).toBeVisible();
    await c.ctx.close();
  });
});

test.describe("permisos y bloqueos", () => {
  test("otro coach no ve la personalización; cancelada y retirada bloquean; un atleta no entra", async ({ browser, consoleGuard }) => {
    // Visita a propósito un detalle inexistente o ajeno: el documento responde 404 real.
    consoleGuard.allow(EXPECTED_DOCUMENT_404);
    test.slow();
    const { a, b, coach, sessionId, assignment } = await setup();
    const other = await createUser("coach", "Coach Ajeno Ajustes");

    const o = await loggedIn(browser, other);
    await o.page.goto(`/coach/sesiones/${sessionId}/atletas/${a.id}/personalizar`);
    await expect(o.page.getByText("Esta sesión no está en tu calendario")).toBeVisible();
    await o.ctx.close();

    // Retirada: B deja de estar asignado.
    await dbQuery(`update assignments set status = 'retirada' where id = $1`, [assignment[b.id]]);
    const c = await loggedIn(browser, coach);
    await c.page.goto(`/coach/sesiones/${sessionId}/atletas/${b.id}/personalizar`);
    await expect(c.page.getByText("El atleta ya no está asignado a esta sesión.")).toBeVisible();

    // Cancelada: sin "Personalizar" y el editor queda bloqueado (también en la BD).
    await dbQuery(`update scheduled_sessions set status = 'cancelada', cancelled_at = now() where id = $1`, [sessionId]);
    await c.page.goto(`/coach/sesiones/${sessionId}`);
    await expect(c.page.getByRole("link", { name: /^Personalizar para/ })).toHaveCount(0);
    await c.page.goto(`/coach/sesiones/${sessionId}/atletas/${a.id}/personalizar`);
    await expect(c.page.getByText("La sesión está cancelada: no se puede personalizar.")).toBeVisible();
    await expect(
      dbQuery(`insert into assignment_overrides (id, assignment_id, block_index, exercise_index, override_sets, updated_at) values (gen_random_uuid(), $1, 0, 0, 2, now())`, [assignment[a.id]]),
    ).rejects.toThrow(/sesiones programadas/);
    await c.ctx.close();

    // Un atleta no entra al editor del coach.
    const ath = await browser.newContext({ baseURL: BASE_URL, storageState: ATHLETE_STATE, locale: "es-MX" });
    const ap = await ath.newPage();
    await ap.goto(`/coach/sesiones/${sessionId}/atletas/${a.id}/personalizar`);
    await expect(ap).toHaveURL(/\/atleta\//);
    await ath.close();
  });

  test("responsive (320–1280) y estados de carga, error, vacío y sin permisos", async ({ browser }) => {
    test.slow();
    const { coach, a, sessionId } = await setup();
    const c = await loggedIn(browser, coach);
    const errors = collectErrors(c.page);
    const editor = `/coach/sesiones/${sessionId}/atletas/${a.id}/personalizar`;
    for (const vp of [
      { width: 320, height: 640 },
      { width: 360, height: 780 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await c.page.setViewportSize(vp);
      await c.page.goto(editor, { waitUntil: "networkidle" });
      await openExercise(c.page, "Sled Push");
      await checkScreen(c.page, `${vp.width}/personalizar`);
      await c.page.goto(`/coach/sesiones/${sessionId}`, { waitUntil: "networkidle" });
      await checkScreen(c.page, `${vp.width}/personalizar_sesion`);
    }
    for (const [state, text] of [
      ["cargando", /Cargando/],
      ["error", /No pudimos cargar/],
      ["vacio", /no tiene ejercicios/],
      ["sin-permisos", /No tienes acceso/],
    ] as const) {
      await c.page.goto(`${editor}?estado=${state}`, { waitUntil: "networkidle" });
      await expect(c.page.locator("main [role=status], main [role=alert]").filter({ hasText: text }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
    await c.ctx.close();
  });
});

async function checkScreen(page: Page, name: string) {
  expect(await horizontalOverflow(page), `sin scroll horizontal (${name})`).toBeLessThanOrEqual(0);
  expect(await smallTargets(page), `áreas táctiles ≥ 44 px (${name})`).toEqual([]);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}
